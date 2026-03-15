"""Logging setup helpers."""

from __future__ import annotations

import json
import logging
import os
from logging.handlers import RotatingFileHandler
from tempfile import gettempdir
from datetime import datetime, timedelta
from pathlib import Path

LOG_RETENTION_DAYS = 7
LOG_MAX_BYTES_PER_FILE = 10 * 1024 * 1024
LOG_MAX_TOTAL_BYTES = 50 * 1024 * 1024
LOG_BACKUP_COUNT = 5


def _candidate_logs_dirs(primary: Path) -> list[Path]:
    """Return ordered candidate directories for file logging."""

    candidates: list[Path] = [primary]

    fallback_env = os.environ.get("PRESTO_FALLBACK_LOGS_DIR", "").strip()
    if fallback_env:
        candidates.append(Path(fallback_env).expanduser())

    candidates.append(Path.cwd() / ".presto" / "logs")
    candidates.append(Path(gettempdir()) / "presto" / "logs")

    unique: list[Path] = []
    seen: set[str] = set()
    for item in candidates:
        key = str(item.resolve()) if item.is_absolute() else str(item)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


class _JsonLogFormatter(logging.Formatter):
    """Compact JSON formatter following v1-lite schema."""

    def __init__(self, *, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "level": str(record.levelname).upper(),
            "service": self.service,
            "module": record.name,
            "event": getattr(record, "event", "python.log"),
            "msg": record.getMessage(),
            "code": getattr(record, "code", ""),
        }
        if record.exc_info:
            payload["err"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _cleanup_log_files(logs_dir: Path) -> None:
    """Apply retention policy: 7 days and <= 50MB total."""

    if not logs_dir.exists():
        return

    now = datetime.utcnow()
    files = [p for p in logs_dir.glob("*.log*") if p.is_file()]

    # Remove aged files first.
    for file_path in files:
        try:
            mtime = datetime.utcfromtimestamp(file_path.stat().st_mtime)
            if now - mtime > timedelta(days=LOG_RETENTION_DAYS):
                file_path.unlink(missing_ok=True)
        except OSError:
            continue

    files = [p for p in logs_dir.glob("*.log*") if p.is_file()]
    # Enforce total-size cap by deleting oldest files first.
    files.sort(key=lambda path: path.stat().st_mtime)
    total_size = sum(path.stat().st_size for path in files)
    for file_path in files:
        if total_size <= LOG_MAX_TOTAL_BYTES:
            break
        try:
            file_size = file_path.stat().st_size
            file_path.unlink(missing_ok=True)
            total_size -= file_size
        except OSError:
            continue


def setup_logging(logs_dir: Path) -> logging.Logger:
    """Configure root logger with console + best-effort daily file log."""

    logger = logging.getLogger("presto")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # Avoid duplicate handlers during repeated startups in test runs.
    if not logger.handlers:
        formatter = _JsonLogFormatter(service="backend-import")

        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

        file_logging_enabled = False
        for candidate_dir in _candidate_logs_dirs(logs_dir):
            log_path = candidate_dir / "app.log"
            try:
                candidate_dir.mkdir(parents=True, exist_ok=True)
                _cleanup_log_files(candidate_dir)
                file_handler = RotatingFileHandler(
                    log_path,
                    maxBytes=LOG_MAX_BYTES_PER_FILE,
                    backupCount=LOG_BACKUP_COUNT,
                    encoding="utf-8",
                )
                file_handler.setFormatter(formatter)
                logger.addHandler(file_handler)
                file_logging_enabled = True
                break
            except OSError as exc:
                logger.warning("Cannot use log file path '%s': %s", log_path, exc)

        if not file_logging_enabled:
            logger.warning("File logging disabled; using console logging only.")

    return logger

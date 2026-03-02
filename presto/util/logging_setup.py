"""Logging setup helpers."""

from __future__ import annotations

import logging
import os
from tempfile import gettempdir
from datetime import datetime
from pathlib import Path


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


def setup_logging(logs_dir: Path) -> logging.Logger:
    """Configure root logger with console + best-effort daily file log."""

    log_name = f"{datetime.now().strftime('%Y-%m-%d')}.log"

    logger = logging.getLogger("presto")
    logger.setLevel(logging.INFO)

    # Avoid duplicate handlers during repeated startups in test runs.
    if not logger.handlers:
        formatter = logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

        file_logging_enabled = False
        for candidate_dir in _candidate_logs_dirs(logs_dir):
            log_path = candidate_dir / log_name
            try:
                candidate_dir.mkdir(parents=True, exist_ok=True)
                file_handler = logging.FileHandler(log_path, encoding="utf-8")
                file_handler.setFormatter(formatter)
                logger.addHandler(file_handler)
                file_logging_enabled = True
                break
            except OSError as exc:
                logger.warning("Cannot use log file path '%s': %s", log_path, exc)

        if not file_logging_enabled:
            logger.warning("File logging disabled; using console logging only.")

    return logger

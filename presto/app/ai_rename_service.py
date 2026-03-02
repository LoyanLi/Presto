"""AI-assisted rename orchestration for import items."""

from __future__ import annotations

import logging
import re
from dataclasses import replace
from pathlib import Path

from presto.domain.errors import AiNamingError
from presto.domain.models import (
    AiNamingConfig,
    ImportItem,
    RenameProposal,
    ResolvedImportItem,
    allocate_unique_track_name,
    is_supported_audio_file,
    sanitize_track_component,
)


class AiRenameService:
    """Generate and finalize AI-based rename proposals."""

    def __init__(self, client, keychain_store, logger: logging.Logger | None = None) -> None:
        self.client = client
        self.keychain_store = keychain_store
        self.logger = logger or logging.getLogger(__name__)

    def generate_proposals(
        self,
        items: list[ImportItem],
        category_map: dict[str, tuple[str, int]],
        existing_track_names: set[str],
        config: AiNamingConfig,
    ) -> list[RenameProposal]:
        proposals: list[RenameProposal] = []
        pending: list[tuple[int, ImportItem, str]] = []

        for item in items:
            stem = Path(item.file_path).stem
            if not is_supported_audio_file(item.file_path):
                proposals.append(
                    RenameProposal(
                        file_path=item.file_path,
                        category_id=item.category_id,
                        original_stem=stem,
                        ai_name="",
                        final_name="",
                        status="skipped",
                        error_message="Only WAV/AIFF files are supported.",
                    )
                )
                continue

            if item.category_id not in category_map:
                proposals.append(
                    RenameProposal(
                        file_path=item.file_path,
                        category_id=item.category_id,
                        original_stem=stem,
                        ai_name="",
                        final_name="",
                        status="failed",
                        error_message=f"Category '{item.category_id}' does not exist.",
                    )
                )
                continue

            proposals.append(
                RenameProposal(
                    file_path=item.file_path,
                    category_id=item.category_id,
                    original_stem=stem,
                    ai_name="",
                    final_name="",
                    status="ready",
                    error_message=None,
                )
            )
            pending.append((len(proposals) - 1, item, stem))

        if config.enabled:
            api_key = self.keychain_store.get_api_key(config.keychain_service, config.keychain_account)
            if not api_key:
                raise AiNamingError(
                    "AI_KEY_MISSING",
                    "AI API key not found in Keychain. Open AI Settings and save your key.",
                )
        else:
            api_key = ""

        if not config.enabled:
            for proposal_index, _item, stem in pending:
                normalized = self.normalize_name(stem)
                proposals[proposal_index] = replace(
                    proposals[proposal_index],
                    ai_name=normalized,
                    final_name=normalized,
                )
        else:
            payload_inputs = [
                {
                    "id": str(local_idx),
                    "original_stem": stem,
                }
                for local_idx, (_proposal_index, _item, stem) in enumerate(pending)
            ]
            categories = [{"id": cid, "name": meta[0]} for cid, meta in category_map.items()]
            try:
                response_items = self.client.generate_names(
                    inputs=payload_inputs,
                    categories=categories,
                    config=config,
                    api_key=api_key,
                )
            except AiNamingError:
                raise
            except Exception as exc:  # pragma: no cover
                raise AiNamingError("AI_API_FAILED", str(exc)) from exc

            by_id = {item["id"]: item for item in response_items}
            lead_vox_category_id, bgv_category_id = self._detect_vocal_category_ids(category_map)
            for local_idx, (proposal_index, item, stem) in enumerate(pending):
                raw = by_id.get(str(local_idx))
                normalized = self.normalize_name(raw["normalized_name"] if raw else stem)
                category_id = raw["category_id"] if raw else item.category_id
                category_id = self._apply_vocal_category_override(
                    proposed_category_id=category_id,
                    original_stem=stem,
                    normalized_name=normalized,
                    lead_vox_category_id=lead_vox_category_id,
                    bgv_category_id=bgv_category_id,
                )
                proposals[proposal_index] = replace(
                    proposals[proposal_index],
                    category_id=category_id,
                    ai_name=normalized,
                    final_name=normalized,
                )

        # Initial dedup pass across session + this batch.
        used_names = set(existing_track_names)
        for index, proposal in enumerate(proposals):
            if proposal.status != "ready":
                continue
            unique = allocate_unique_track_name(proposal.final_name, used_names)
            used_names.add(unique)
            proposals[index] = replace(proposal, final_name=unique)

        return proposals

    def finalize_for_import(
        self,
        proposals: list[RenameProposal],
        manual_name_by_path: dict[str, str],
        existing_track_names: set[str],
    ) -> tuple[list[RenameProposal], list[ResolvedImportItem]]:
        updated: list[RenameProposal] = []
        resolved: list[ResolvedImportItem] = []
        used_names = set(existing_track_names)

        for proposal in proposals:
            if proposal.status != "ready":
                updated.append(proposal)
                continue

            requested = manual_name_by_path.get(proposal.file_path, proposal.final_name)
            normalized = self.normalize_name(requested)
            if not normalized:
                normalized = "Untitled"
            unique = allocate_unique_track_name(normalized, used_names)
            used_names.add(unique)

            revised = replace(proposal, final_name=unique)
            updated.append(revised)
            resolved.append(
                ResolvedImportItem(
                    file_path=proposal.file_path,
                    category_id=proposal.category_id,
                    target_track_name=unique,
                )
            )

        return updated, resolved

    @staticmethod
    def normalize_name(value: str) -> str:
        """Normalize a candidate into underscore style while keeping language semantics."""

        cleaned = sanitize_track_component(value)
        cleaned = re.sub(r"[^\w\s-]+", " ", cleaned, flags=re.UNICODE)
        cleaned = re.sub(r"[\s-]+", "_", cleaned, flags=re.UNICODE)
        cleaned = re.sub(r"_+", "_", cleaned).strip("_")

        if not cleaned:
            return "Untitled"

        parts = [part for part in cleaned.split("_") if not re.fullmatch(r"\d{3,}", part)]
        if parts:
            titled_parts = [AiRenameService._title_case_english(part) for part in parts]
            cleaned = "_".join(titled_parts)

        cleaned = cleaned.strip("_")
        return cleaned or "Untitled"

    @staticmethod
    def _title_case_english(value: str) -> str:
        return re.sub(r"[A-Za-z]+", lambda m: m.group(0).lower().capitalize(), value)

    @staticmethod
    def _detect_vocal_category_ids(category_map: dict[str, tuple[str, int]]) -> tuple[str | None, str | None]:
        lead_id: str | None = None
        bgv_id: str | None = None

        for category_id, (category_name, _slot) in category_map.items():
            probe = f"{category_id} {category_name}".lower().replace(" ", "")
            if bgv_id is None and any(
                key in probe for key in ("bgv", "backup", "backing", "harmony", "double", "choir", "和声", "叠唱")
            ):
                bgv_id = category_id
                continue
            if lead_id is None and any(
                key in probe for key in ("leadvox", "leadvocal", "lead", "vocal", "vox", "主唱")
            ):
                lead_id = category_id

        return lead_id, bgv_id

    @staticmethod
    def _apply_vocal_category_override(
        proposed_category_id: str,
        original_stem: str,
        normalized_name: str,
        lead_vox_category_id: str | None,
        bgv_category_id: str | None,
    ) -> str:
        text = f"{original_stem} {normalized_name}".lower()

        bgv_keywords = (
            "backup",
            "backing",
            "bgv",
            "harmony",
            "harm",
            "double",
            "doubler",
            "adlib",
            "choir",
            "和声",
            "叠唱",
        )
        lead_keywords = ("vocal", "vox", "lead", "主唱", "主vocal", "主_vox")

        if bgv_category_id and any(keyword in text for keyword in bgv_keywords):
            return bgv_category_id
        if lead_vox_category_id and any(keyword in text for keyword in lead_keywords):
            return lead_vox_category_id
        return proposed_category_id

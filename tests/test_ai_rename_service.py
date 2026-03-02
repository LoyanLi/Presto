from __future__ import annotations

import unittest
from pathlib import Path

from presto.app.ai_rename_service import AiRenameService
from presto.domain.models import AiNamingConfig, ImportItem


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[list[dict[str, str]], list[dict[str, str]]]] = []

    def generate_names(self, inputs, categories, config, api_key):
        self.calls.append((inputs, categories))
        # Return same base name for all items to force dedup suffix behavior.
        return [{"id": item["id"], "normalized_name": "主_vocal", "category_id": "vox"} for item in inputs]


class _WrongCategoryClient:
    def generate_names(self, inputs, categories, config, api_key):
        items = []
        for item in inputs:
            stem = str(item["original_stem"]).lower()
            if "backup" in stem:
                items.append({"id": item["id"], "normalized_name": "Backup_Vocal", "category_id": "lead_vox"})
            else:
                items.append({"id": item["id"], "normalized_name": "Lead_Vocal", "category_id": "bgv"})
        return items


class _FakeKeychain:
    def get_api_key(self, service: str, account: str):
        return "key"


class AiRenameServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = AiRenameService(client=_FakeClient(), keychain_store=_FakeKeychain())
        self.config = AiNamingConfig(
            enabled=True,
            base_url="https://example.com/v1",
            model="gpt-test",
            timeout_seconds=10,
            keychain_service="svc",
            keychain_account="acc",
        )

    def test_generate_proposals_grouped_and_deduped(self) -> None:
        items = [
            ImportItem("/tmp/a.wav", "vox"),
            ImportItem("/tmp/b.wav", "vox"),
            ImportItem("/tmp/c.wav", "drums"),
            ImportItem("/tmp/d.mp3", "drums"),
        ]
        category_map = {"vox": ("LeadVox", 1), "drums": ("Drums", 2)}

        proposals = self.service.generate_proposals(
            items=items,
            category_map=category_map,
            existing_track_names={"主_Vocal"},
            config=self.config,
        )

        ready = [p for p in proposals if p.status == "ready"]
        self.assertEqual(len(ready), 3)
        self.assertEqual([p.final_name for p in ready], ["主_Vocal_2", "主_Vocal_3", "主_Vocal_4"])
        self.assertTrue(all(p.category_id == "vox" for p in ready))

        skipped = [p for p in proposals if p.status == "skipped"]
        self.assertEqual(len(skipped), 1)

        client = self.service.client
        self.assertEqual(len(client.calls), 1)
        sent_inputs, _sent_categories = client.calls[0]
        self.assertTrue(sent_inputs)
        self.assertTrue(all(set(item.keys()) == {"id", "original_stem"} for item in sent_inputs))

    def test_finalize_for_import_applies_manual_and_rededups(self) -> None:
        items = [ImportItem("/tmp/a.wav", "vox"), ImportItem("/tmp/b.wav", "vox")]
        category_map = {"vox": ("LeadVox", 1)}

        proposals = self.service.generate_proposals(
            items=items,
            category_map=category_map,
            existing_track_names=set(),
            config=self.config,
        )
        updated, resolved = self.service.finalize_for_import(
            proposals=proposals,
            manual_name_by_path={"/tmp/a.wav": "主 vocal", "/tmp/b.wav": "主 vocal"},
            existing_track_names=set(),
        )

        self.assertEqual([p.final_name for p in updated if p.status == "ready"], ["主_Vocal", "主_Vocal_2"])
        self.assertEqual([item.target_track_name for item in resolved], ["主_Vocal", "主_Vocal_2"])

    def test_normalize_name_title_cases_english_tokens(self) -> None:
        self.assertEqual(self.service.normalize_name("lead vocal take"), "Lead_Vocal_Take")
        self.assertEqual(self.service.normalize_name("主 vocal take"), "主_Vocal_Take")

    def test_vocal_backup_category_override(self) -> None:
        service = AiRenameService(client=_WrongCategoryClient(), keychain_store=_FakeKeychain())
        items = [
            ImportItem("/tmp/main vocal.wav", "drums"),
            ImportItem("/tmp/backup vox.wav", "drums"),
        ]
        category_map = {
            "lead_vox": ("LeadVox", 1),
            "bgv": ("BGV", 2),
            "drums": ("Drums", 3),
        }
        proposals = service.generate_proposals(
            items=items,
            category_map=category_map,
            existing_track_names=set(),
            config=self.config,
        )
        mapping = {Path(p.file_path).stem.lower(): p.category_id for p in proposals if p.status == "ready"}
        self.assertEqual(mapping["main vocal"], "lead_vox")
        self.assertEqual(mapping["backup vox"], "bgv")


if __name__ == "__main__":
    unittest.main()

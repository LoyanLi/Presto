from __future__ import annotations

from presto.application.capabilities.catalog import DEFAULT_CAPABILITY_DEFINITIONS


def test_track_color_catalog_does_not_expose_apply_via_ui() -> None:
    capability_ids = {definition.id for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert "track.color.apply" in capability_ids
    assert "track.hidden.set" in capability_ids
    assert "track.inactive.set" in capability_ids
    assert "automation.splitStereoToMono.execute" in capability_ids
    for capability_id in ("workflow.run.start", "import.planRunItems", "import.run.start", "export.range.set", "export.start", "export.direct.start", "export.run.start"):
        assert capability_id in capability_ids
    for capability_id in ("jobs.create", "jobs.update", "jobs.get", "jobs.list", "jobs.cancel", "jobs.delete"):
        assert capability_id in capability_ids

    for capability_id in (
        "ai.key.getStatus",
        "ai.key.set",
        "import.preflight",
        "session.requireOpen",
        "track.requireAnySelected",
        "daw.requireMinimumVersion",
        "trackColor.requireSupport",
        "audio.importOne",
        "audio.importBatch",
        "export.cancel",
        "export.isCancelled",
        "mac.preflightAccessibility",
        "track.color.applyViaUi",
    ):
        assert capability_id not in capability_ids


def test_job_capability_catalog_kinds_match_public_contract() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert definitions["workflow.run.start"].kind == "job"
    assert definitions["import.planRunItems"].kind == "query"
    assert definitions["import.run.start"].kind == "job"
    assert definitions["export.start"].kind == "job"
    assert definitions["export.direct.start"].kind == "job"
    assert definitions["export.run.start"].kind == "job"
    assert definitions["jobs.create"].kind == "command"
    assert definitions["jobs.update"].kind == "command"


def test_capability_catalog_is_loaded_from_generated_source() -> None:
    from presto.application.capabilities import catalog as catalog_module
    from presto.application.capabilities import catalog_generated

    assert catalog_module.DEFAULT_CAPABILITY_DEFINITIONS is catalog_generated.DEFAULT_CAPABILITY_DEFINITIONS


def test_capability_catalog_only_declares_handlers_implemented_by_backend() -> None:
    from presto.application.handlers.invoker import _CAPABILITY_HANDLERS

    declared_handlers = {definition.handler for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert declared_handlers.issubset(set(_CAPABILITY_HANDLERS))

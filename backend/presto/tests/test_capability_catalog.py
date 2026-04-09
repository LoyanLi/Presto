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
    from presto.application.handlers.invoker import HANDLER_BINDINGS

    declared_handlers = {definition.handler for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert declared_handlers.issubset(set(HANDLER_BINDINGS))


def test_capability_handler_bindings_use_single_context_execution_model() -> None:
    from presto.application.handlers.invoker import HANDLER_BINDINGS

    assert HANDLER_BINDINGS

    for handler in HANDLER_BINDINGS.values():
        assert callable(handler)


def test_public_capabilities_declare_canonical_metadata() -> None:
    public_definitions = [definition for definition in DEFAULT_CAPABILITY_DEFINITIONS if definition.visibility == "public"]

    assert public_definitions

    for definition in public_definitions:
        assert definition.supported_daws
        assert definition.canonical_source in definition.supported_daws
        assert definition.field_support
        assert definition.canonical_source in definition.field_support


def test_track_toggle_capabilities_expose_canonical_toggle_shape() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    for capability_id in (
        "track.mute.set",
        "track.solo.set",
        "track.hidden.set",
        "track.inactive.set",
        "track.recordEnable.set",
        "track.recordSafe.set",
        "track.inputMonitor.set",
        "track.online.set",
        "track.frozen.set",
        "track.open.set",
    ):
        definition = definitions[capability_id]
        support = definition.field_support[definition.canonical_source]

        assert support.request_fields == ("trackNames", "enabled")
        assert support.response_fields == ("updated", "trackNames", "enabled")


def test_capability_catalog_declares_runtime_dependencies_used_by_handlers() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert definitions["session.getSnapshotInfo"].depends_on == ()
    assert definitions["stripSilence.open"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["stripSilence.execute"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["stripSilence.openViaUi"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["stripSilence.executeViaUi"].depends_on == ("mac_automation", "daw_ui_profile")

from __future__ import annotations

from presto.application.capabilities.catalog import DEFAULT_CAPABILITY_DEFINITIONS


def test_track_color_catalog_does_not_expose_apply_via_ui() -> None:
    capability_ids = {definition.id for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert "daw.track.color.apply" in capability_ids
    assert "daw.track.hidden.set" in capability_ids
    assert "daw.track.inactive.set" in capability_ids
    assert "daw.automation.splitStereoToMono.execute" in capability_ids
    for capability_id in ("workflow.run.start", "daw.import.planRunItems", "daw.import.run.start", "daw.export.range.set", "daw.export.start", "daw.export.direct.start", "daw.export.run.start"):
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
        "daw.track.color.applyViaUi",
    ):
        assert capability_id not in capability_ids


def test_job_capability_catalog_kinds_match_public_contract() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert definitions["workflow.run.start"].kind == "job"
    assert definitions["daw.import.planRunItems"].kind == "query"
    assert definitions["daw.import.run.start"].kind == "job"
    assert definitions["daw.export.start"].kind == "job"
    assert definitions["daw.export.direct.start"].kind == "job"
    assert definitions["daw.export.run.start"].kind == "job"
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


def test_capability_catalog_declares_workflow_scope_portability_and_implementations() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    for definition in DEFAULT_CAPABILITY_DEFINITIONS:
        assert definition.workflow_scope in ("shared", "daw_specific", "internal")
        assert definition.portability in ("canonical", "daw_specific")
        assert definition.implementations
        assert set(definition.implementations.keys()) == set(definition.supported_daws)
        assert definition.canonical_source in definition.implementations

    track_mute = definitions["daw.track.mute.set"]
    track_mute_impl = track_mute.implementations["pro_tools"]
    assert track_mute.workflow_scope == "shared"
    assert track_mute.portability == "canonical"
    assert track_mute_impl.kind == "handler"
    assert track_mute_impl.handler == "daw.track.mute.set"

    ptsl_execute = definitions["daw.ptsl.command.execute"]
    ptsl_execute_impl = ptsl_execute.implementations["pro_tools"]
    assert ptsl_execute.workflow_scope == "internal"
    assert ptsl_execute.portability == "daw_specific"
    assert ptsl_execute_impl.kind == "handler"
    assert ptsl_execute_impl.handler == "daw.ptsl.command.execute"

    strip_silence_ui = definitions["daw.stripSilence.executeViaUi"]
    strip_silence_ui_impl = strip_silence_ui.implementations["pro_tools"]
    assert strip_silence_ui.workflow_scope == "internal"
    assert strip_silence_ui.portability == "daw_specific"
    assert strip_silence_ui_impl.kind == "ui_automation"
    assert strip_silence_ui_impl.handler == "daw.stripSilence.executeViaUi"


def test_generated_ptsl_semantic_capabilities_use_vendor_neutral_public_ids() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}
    public_ptsl_command_capabilities = [
        definition
        for definition in DEFAULT_CAPABILITY_DEFINITIONS
        if definition.visibility == "public"
        and definition.implementations[definition.canonical_source].kind == "ptsl_command"
    ]

    assert len(public_ptsl_command_capabilities) == 143
    assert all(not definition.id.startswith("daw.ptsl.") for definition in public_ptsl_command_capabilities)

    create_session = definitions["daw.sessionFile.createSession"]
    implementation = create_session.implementations["pro_tools"]

    assert create_session.workflow_scope == "daw_specific"
    assert create_session.portability == "daw_specific"
    assert implementation.kind == "ptsl_command"
    assert implementation.command == "CId_CreateSession"


def test_duplicate_ptsl_commands_collapse_into_existing_canonical_public_capabilities() -> None:
    capability_ids = {definition.id for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    for canonical_capability_id in (
        "daw.track.list",
        "daw.clip.selectAllOnTrack",
        "daw.session.save",
        "daw.session.getLength",
        "daw.track.select",
        "daw.track.color.apply",
        "daw.track.mute.set",
        "daw.track.solo.set",
        "daw.track.hidden.set",
        "daw.track.inactive.set",
        "daw.track.recordEnable.set",
        "daw.track.recordSafe.set",
        "daw.track.inputMonitor.set",
        "daw.track.online.set",
        "daw.track.frozen.set",
        "daw.track.open.set",
    ):
        assert canonical_capability_id in capability_ids

    for removed_duplicate_id in (
        "daw.sessionRead.getTrackList",
        "daw.editing.selectAllClipsOnTrack",
        "daw.sessionFile.saveSession",
        "daw.sessionRead.getSessionLength",
        "daw.editing.selectTracksByName",
        "daw.editing.setTrackColor",
        "daw.editing.setTrackMuteState",
        "daw.editing.setTrackSoloState",
        "daw.editing.setTrackHiddenState",
        "daw.editing.setTrackInactiveState",
        "daw.editing.setTrackRecordEnableState",
        "daw.editing.setTrackRecordSafeEnableState",
        "daw.editing.setTrackInputMonitorState",
        "daw.editing.setTrackOnlineState",
        "daw.editing.setTrackFrozenState",
        "daw.editing.setTrackOpenState",
    ):
        assert removed_duplicate_id not in capability_ids


def test_track_toggle_capabilities_expose_canonical_toggle_shape() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    for capability_id in (
        "daw.track.mute.set",
        "daw.track.solo.set",
        "daw.track.hidden.set",
        "daw.track.inactive.set",
        "daw.track.recordEnable.set",
        "daw.track.recordSafe.set",
        "daw.track.inputMonitor.set",
        "daw.track.online.set",
        "daw.track.frozen.set",
        "daw.track.open.set",
    ):
        definition = definitions[capability_id]
        support = definition.field_support[definition.canonical_source]

        assert support.request_fields == ("trackNames", "enabled")
        assert support.response_fields == ("updated", "trackNames", "enabled")


def test_capability_catalog_declares_runtime_dependencies_used_by_handlers() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert definitions["daw.session.getSnapshotInfo"].depends_on == ()
    assert definitions["daw.stripSilence.open"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["daw.stripSilence.execute"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["daw.stripSilence.openViaUi"].depends_on == ("mac_automation", "daw_ui_profile")
    assert definitions["daw.stripSilence.executeViaUi"].depends_on == ("mac_automation", "daw_ui_profile")


def test_internal_ptsl_capabilities_stay_out_of_public_registry_listing() -> None:
    from presto.application.capabilities.registry import build_default_capability_registry

    registry = build_default_capability_registry()

    public_ids = {definition.id for definition in registry.list_public()}
    all_ids = {definition.id for definition in registry.list_all()}

    assert "daw.ptsl.catalog.list" not in public_ids
    assert "daw.ptsl.command.describe" not in public_ids
    assert "daw.ptsl.command.execute" not in public_ids
    assert "daw.ptsl.catalog.list" in all_ids
    assert "daw.ptsl.command.describe" in all_ids
    assert "daw.ptsl.command.execute" in all_ids

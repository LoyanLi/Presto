from presto.integrations.daw.base import DawAdapter


def test_daw_adapter_protocol_exposes_batch_track_toggle_methods() -> None:
    required_methods = {
        "set_track_mute_state_batch",
        "set_track_solo_state_batch",
        "set_track_record_enable_state_batch",
        "set_track_record_safe_state_batch",
        "set_track_input_monitor_state_batch",
        "set_track_online_state_batch",
        "set_track_frozen_state_batch",
        "set_track_open_state_batch",
    }

    assert required_methods.issubset(DawAdapter.__dict__.keys())

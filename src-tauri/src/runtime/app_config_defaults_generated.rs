// Auto-generated from contracts-manifest/app-config-defaults.json; do not edit by hand.
pub(super) const HOST_PREFERENCES_KEY: &str = "hostPreferences";
pub(super) const DAW_TARGET_KEY: &str = "dawTarget";

pub(super) fn default_runtime_config() -> serde_json::Value {
    serde_json::from_str(
        r###"{
  "categories": [],
  "silenceProfile": {
    "thresholdDb": -40,
    "minStripMs": 50,
    "minSilenceMs": 250,
    "startPadMs": 0,
    "endPadMs": 0
  },
  "aiNaming": {
    "enabled": false,
    "baseUrl": "",
    "model": "",
    "timeoutSeconds": 30,
    "keychainService": "openai",
    "keychainAccount": "api_key"
  },
  "uiPreferences": {
    "logsCollapsedByDefault": true,
    "followSystemTheme": true,
    "developerModeEnabled": true
  },
  "hostPreferences": {
    "language": "system",
    "dawTarget": "pro_tools",
    "includePrereleaseUpdates": false
  }
}"###,
    )
    .expect("generated app config defaults must be valid JSON")
}

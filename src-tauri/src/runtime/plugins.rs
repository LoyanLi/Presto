use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

use super::{
    automation_definitions_dir, automation_scripts_dir, managed_plugins_root, official_plugins_root,
    unique_suffix, AutomationDefinitionRecord, PluginCandidate, RuntimeState, WorkflowDefinitionRef,
};

pub(super) fn sync_official_plugins(state: &Arc<RuntimeState>) -> Result<(), String> {
    let source_root = official_plugins_root(state)?;
    if !source_root.exists() {
        return Ok(());
    }
    let destination_root = managed_plugins_root(state)?;
    fs::create_dir_all(&destination_root).map_err(|error| error.to_string())?;
    let (plugins, _) = discover_plugins(state, &[source_root], false)?;
    for plugin in plugins {
        let target_root = destination_root.join(sanitize_plugin_folder_name(&plugin.plugin_id));
        if target_root.exists() {
            fs::remove_dir_all(&target_root).map_err(|error| error.to_string())?;
        }
        copy_dir_recursive(&plugin.plugin_root, &target_root)?;
    }
    Ok(())
}

pub(super) fn list_plugins(state: &Arc<RuntimeState>) -> Result<Value, String> {
    let root = managed_plugins_root(state)?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let (plugins, mut issues) = discover_plugins(state, &[root.clone()], true)?;
    let enabled_state = read_plugin_enabled_state(state)?;
    let mut records = Vec::new();

    for plugin in plugins {
        let entry_path = plugin.plugin_root.join(&plugin.entry);
        let loadable = entry_path.exists();
        if !loadable {
            issues.push(create_issue(
                "entry_load:module_load_failed",
                Some(&plugin.plugin_root),
                Some(&plugin.manifest_path),
            ));
        }
        records.push(json!({
            "pluginId": plugin.plugin_id,
            "displayName": plugin.display_name,
            "version": plugin.version,
            "pluginRoot": plugin.plugin_root.to_string_lossy().to_string(),
            "entryPath": entry_path.to_string_lossy().to_string(),
            "manifest": plugin.manifest,
            "settingsPages": plugin.settings_pages,
            "loadable": loadable,
            "enabled": enabled_state.get(&plugin.plugin_id).copied().unwrap_or(true),
        }));
    }

    Ok(json!({
        "managedPluginsRoot": root.to_string_lossy().to_string(),
        "plugins": records,
        "issues": issues,
    }))
}

pub(super) fn install_plugin_from_directory(
    state: &Arc<RuntimeState>,
    selected_path: &Path,
    overwrite: bool,
) -> Result<Value, String> {
    let selected_root = selected_path.to_path_buf();
    let managed_root = managed_plugins_root(state)?;
    fs::create_dir_all(&managed_root).map_err(|error| error.to_string())?;
    let (plugins, issues) = discover_plugins(state, &[selected_root.clone()], false)?;
    if plugins.is_empty() {
        return Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "issues": if issues.is_empty() {
                vec![create_issue("plugin_not_found", Some(&selected_root), None)]
            } else {
                issues
            },
        }));
    }
    if plugins.len() > 1 {
        return Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "issues": [create_issue("install:multiple_plugin_candidates_found", Some(&selected_root), None)],
        }));
    }

    let plugin = plugins
        .first()
        .cloned()
        .ok_or_else(|| "plugin_not_found".to_string())?;
    let destination_root = managed_root.join(sanitize_plugin_folder_name(&plugin.plugin_id));
    if destination_root.exists() {
        if !overwrite {
            return Ok(json!({
                "ok": false,
                "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
                "issues": [create_issue("install:plugin_already_installed", Some(&destination_root), None)],
            }));
        }
        fs::remove_dir_all(&destination_root).map_err(|error| error.to_string())?;
    }

    copy_dir_recursive(&plugin.plugin_root, &destination_root)?;
    let verification = list_plugins(state)?;
    let installed = verification
        .get("plugins")
        .and_then(Value::as_array)
        .and_then(|entries| {
            entries.iter().find(|entry| {
                entry
                    .get("pluginId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    == plugin.plugin_id
            })
        })
        .cloned();

    match installed {
        Some(installed_plugin) => Ok(json!({
            "ok": true,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "plugin": installed_plugin,
            "issues": verification.get("issues").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        })),
        None => Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "issues": [create_issue("install:post_install_verification_failed", Some(&destination_root), None)],
        })),
    }
}

pub(super) fn install_plugin_from_zip(
    state: &Arc<RuntimeState>,
    zip_path: &Path,
    overwrite: bool,
) -> Result<Value, String> {
    let temp_root = std::env::temp_dir().join(format!("presto-plugin-install-{}", unique_suffix()));
    let extract_root = temp_root.join("extracted");
    fs::create_dir_all(&extract_root).map_err(|error| error.to_string())?;

    let unzip_result = Command::new("unzip")
        .arg("-qq")
        .arg("-o")
        .arg(zip_path)
        .arg("-d")
        .arg(&extract_root)
        .status()
        .map_err(|error| error.to_string());

    let result = match unzip_result {
        Ok(status) if status.success() => install_plugin_from_directory(state, &extract_root, overwrite),
        Ok(_) => Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_plugins_root(state)?.to_string_lossy().to_string(),
            "issues": [create_issue("install:zip_install_failed", Some(zip_path), None)],
        })),
        Err(error) => Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_plugins_root(state)?.to_string_lossy().to_string(),
            "issues": [create_issue(&format!("install:{error}"), Some(zip_path), None)],
        })),
    };

    let _ = fs::remove_dir_all(&temp_root);
    result
}

pub(super) fn set_plugin_enabled(
    state: &Arc<RuntimeState>,
    plugin_id: &str,
    enabled: bool,
) -> Result<Value, String> {
    let managed_root = managed_plugins_root(state)?;
    let plugin_root = managed_root.join(sanitize_plugin_folder_name(plugin_id));
    if !plugin_root.join("manifest.json").exists() {
        return Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "pluginId": plugin_id,
            "enabled": enabled,
            "issues": [create_issue("install:plugin_not_installed_in_managed_root", Some(&plugin_root), None)],
        }));
    }

    let mut enabled_state = read_plugin_enabled_state(state)?;
    if enabled {
        enabled_state.remove(plugin_id);
    } else {
        enabled_state.insert(plugin_id.to_string(), false);
    }
    write_plugin_enabled_state(state, &enabled_state)?;
    Ok(json!({
        "ok": true,
        "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
        "pluginId": plugin_id,
        "enabled": enabled,
        "issues": [],
    }))
}

pub(super) fn uninstall_plugin(
    state: &Arc<RuntimeState>,
    plugin_id: &str,
) -> Result<Value, String> {
    let managed_root = managed_plugins_root(state)?;
    let plugin_root = managed_root.join(sanitize_plugin_folder_name(plugin_id));
    if !plugin_root.join("manifest.json").exists() {
        return Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "pluginId": plugin_id,
            "issues": [create_issue("install:plugin_not_installed_in_managed_root", Some(&plugin_root), None)],
        }));
    }
    if plugin_id.starts_with("official.") {
        return Ok(json!({
            "ok": false,
            "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
            "pluginId": plugin_id,
            "issues": [create_issue("install:official_plugin_cannot_be_uninstalled", Some(&plugin_root), None)],
        }));
    }

    fs::remove_dir_all(&plugin_root).map_err(|error| error.to_string())?;
    let mut enabled_state = read_plugin_enabled_state(state)?;
    enabled_state.remove(plugin_id);
    write_plugin_enabled_state(state, &enabled_state)?;
    Ok(json!({
        "ok": true,
        "managedPluginsRoot": managed_root.to_string_lossy().to_string(),
        "pluginId": plugin_id,
        "issues": [],
    }))
}

pub(super) fn resolve_workflow_execution(
    state: &Arc<RuntimeState>,
    plugin_id: &str,
    workflow_id: &str,
) -> Result<Value, String> {
    if plugin_id.trim().is_empty() {
        return Err("plugin_id_required".to_string());
    }
    if workflow_id.trim().is_empty() {
        return Err("workflow_id_required".to_string());
    }

    let managed_root = managed_plugins_root(state)?;
    let (plugins, _) = discover_plugins(state, &[managed_root], true)?;
    let plugin = plugins
        .into_iter()
        .find(|candidate| candidate.plugin_id == plugin_id)
        .ok_or_else(|| format!("plugin_not_installed:{plugin_id}"))?;

    let enabled_state = read_plugin_enabled_state(state)?;
    if !enabled_state.get(plugin_id).copied().unwrap_or(true) {
        return Err(format!("plugin_disabled:{plugin_id}"));
    }

    let workflow_definition = plugin
        .workflow_definition
        .ok_or_else(|| format!("workflow_definition_not_declared:{plugin_id}"))?;
    if workflow_definition.workflow_id != workflow_id {
        return Err(format!("workflow_id_mismatch:{plugin_id}:{workflow_id}"));
    }

    let definition_path = plugin.plugin_root.join(workflow_definition.definition_entry);
    let definition_text = fs::read_to_string(&definition_path).map_err(|error| error.to_string())?;
    let definition =
        serde_json::from_str::<Value>(&definition_text).map_err(|error| error.to_string())?;
    if definition
        .get("workflowId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        != workflow_id
    {
        return Err(format!("workflow_definition_mismatch:{plugin_id}:{workflow_id}"));
    }

    Ok(json!({
        "definition": definition,
        "allowedCapabilities": plugin.required_capabilities,
    }))
}

pub(super) fn list_automation_definitions(state: &Arc<RuntimeState>) -> Result<Value, String> {
    let records = load_automation_records(state)?;
    Ok(Value::Array(
        records
            .into_iter()
            .map(|record| {
                json!({
                    "id": record.id,
                    "title": record.title,
                    "app": record.app,
                    "description": record.description,
                })
            })
            .collect(),
    ))
}

pub(super) fn run_automation_definition(
    state: &Arc<RuntimeState>,
    request: Value,
) -> Result<Value, String> {
    let definition_id = request
        .get("definitionId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let records = load_automation_records(state)?;
    let definition = records
        .into_iter()
        .find(|candidate| candidate.id == definition_id);

    let definition = match definition {
        Some(definition) => definition,
        None => {
            return Ok(json!({
                "ok": false,
                "steps": [],
                "error": {
                    "code": "AUTOMATION_DEFINITION_NOT_FOUND",
                    "message": format!("Unknown automation definition: {}", if definition_id.is_empty() { "unknown" } else { &definition_id }),
                },
            }))
        }
    };

    let preflight = super::mac_accessibility_preflight()?;
    if !preflight.get("ok").and_then(Value::as_bool).unwrap_or(false)
        || !preflight
            .get("trusted")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        let error_code = preflight
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("MAC_ACCESSIBILITY_UNAVAILABLE");
        return Ok(json!({
            "ok": false,
            "steps": [{
                "id": "preflight",
                "status": "failed",
                "message": error_code,
            }],
            "error": {
                "code": error_code,
                "message": error_code,
                "stepId": "preflight",
                "details": {
                    "definitionId": definition_id,
                },
            },
        }));
    }

    let input = request
        .get("input")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let args = definition
        .input_keys
        .iter()
        .map(|key| {
            input
                .get(key)
                .map(Value::to_string)
                .unwrap_or_else(String::new)
                .trim_matches('"')
                .to_string()
        })
        .collect::<Vec<_>>();
    let execution =
        super::run_mac_accessibility_file(&definition.script_path.to_string_lossy(), &args)?;

    if !execution.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let error = execution.get("error").cloned().unwrap_or_else(|| {
            json!({ "code": "AUTOMATION_EXECUTION_FAILED", "message": "automation execution failed" })
        });
        return Ok(json!({
            "ok": false,
            "steps": [
                { "id": "preflight", "status": "succeeded" },
                {
                    "id": "execute",
                    "status": "failed",
                    "message": error.get("message").cloned().unwrap_or_else(|| Value::String("automation execution failed".to_string())),
                }
            ],
            "error": {
                "code": error.get("code").cloned().unwrap_or_else(|| Value::String("AUTOMATION_EXECUTION_FAILED".to_string())),
                "message": error.get("message").cloned().unwrap_or_else(|| Value::String("automation execution failed".to_string())),
                "stepId": "execute",
                "details": {
                    "definitionId": definition_id,
                },
            },
        }));
    }

    let text = super::get_dynamic_key(&execution, &super::std_out_key())
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let parsed_output = if text.is_empty() {
        Value::Null
    } else if let Ok(value) = serde_json::from_str::<Value>(&text) {
        if value.is_object() {
            value
        } else {
            json!({ "value": value })
        }
    } else {
        json!({ "stdout": text })
    };

    let mut result = json!({
        "ok": true,
        "steps": [
            { "id": "preflight", "status": "succeeded" },
            { "id": "execute", "status": "succeeded" }
        ],
    });
    if parsed_output != Value::Null {
        result
            .as_object_mut()
            .ok_or_else(|| "automation_result_invalid".to_string())?
            .insert("output".to_string(), parsed_output);
    }
    Ok(result)
}

fn sanitize_plugin_folder_name(plugin_id: &str) -> String {
    plugin_id
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '.' | '_' | '-') {
                char
            } else {
                '_'
            }
        })
        .collect()
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(&entry_path, &destination_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn issue_category(reason: &str) -> &'static str {
    if reason.starts_with("manifest_validation:") {
        "manifest"
    } else if reason.starts_with("permission_validation:") {
        "permission"
    } else if reason.starts_with("daw_support_validation:") {
        "daw_support"
    } else if reason.starts_with("entry_load:") {
        "entry_load"
    } else if reason.starts_with("install:") {
        "install"
    } else {
        "discovery"
    }
}

fn create_issue(reason: &str, plugin_root: Option<&Path>, manifest_path: Option<&Path>) -> Value {
    json!({
        "category": issue_category(reason),
        "reason": reason,
        "pluginRoot": plugin_root.map(|path| path.to_string_lossy().to_string()),
        "manifestPath": manifest_path.map(|path| path.to_string_lossy().to_string()),
    })
}

fn collect_plugin_roots(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() || !root.is_dir() {
        return Ok(Vec::new());
    }
    if root.join("manifest.json").exists() {
        return Ok(vec![root.to_path_buf()]);
    }

    let mut plugin_roots = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        if entry_path.is_dir() && entry_path.join("manifest.json").exists() {
            plugin_roots.push(entry_path);
        }
    }
    Ok(plugin_roots)
}

fn validate_plugin_manifest(
    manifest: &Value,
    plugin_root: &Path,
    current_daw: &str,
) -> Result<PluginCandidate, String> {
    let manifest_object = manifest
        .as_object()
        .ok_or_else(|| "manifest_validation:root:must_be_object".to_string())?;
    let plugin_id = required_string_field(manifest_object, "pluginId")?;
    let display_name = required_string_field(manifest_object, "displayName")?;
    let version = required_string_field(manifest_object, "version")?;
    let entry = required_string_field(manifest_object, "entry")?;
    let extension_type = required_string_field(manifest_object, "extensionType")?;
    let host_api_version = required_string_field(manifest_object, "hostApiVersion")?;

    if !matches!(host_api_version.as_str(), "0.1.0" | "1" | "1.0.0") {
        return Err("manifest_validation:hostApiVersion:unsupported_host_api_version".to_string());
    }

    let supported_daws = required_string_array_field(manifest_object, "supportedDaws")?;
    if !supported_daws.iter().any(|candidate| candidate == current_daw) {
        return Err("daw_support_validation:supportedDaws:not_supported_on_current_daw".to_string());
    }

    let required_capabilities = required_string_array_field(manifest_object, "requiredCapabilities")?;
    let settings_pages = manifest_object
        .get("settingsPages")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));

    let workflow_definition = if extension_type == "workflow" {
        let workflow = manifest_object
            .get("workflowDefinition")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                "manifest_validation:workflowDefinition:required_for_workflow_plugins".to_string()
            })?;
        Some(WorkflowDefinitionRef {
            workflow_id: required_string_field(workflow, "workflowId")?,
            definition_entry: required_string_field(workflow, "definitionEntry")?,
        })
    } else {
        None
    };

    Ok(PluginCandidate {
        plugin_root: plugin_root.to_path_buf(),
        manifest_path: plugin_root.join("manifest.json"),
        manifest: manifest.clone(),
        plugin_id,
        display_name,
        version,
        entry,
        settings_pages,
        required_capabilities,
        workflow_definition,
    })
}

fn required_string_field(map: &Map<String, Value>, field: &str) -> Result<String, String> {
    map.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("manifest_validation:{field}:must_be_non_empty_string"))
}

fn required_string_array_field(
    map: &Map<String, Value>,
    field: &str,
) -> Result<Vec<String>, String> {
    let array = map
        .get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("manifest_validation:{field}:must_be_array"))?;
    let mut values = Vec::with_capacity(array.len());
    for item in array {
        let value = item
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .ok_or_else(|| format!("manifest_validation:{field}:must_contain_non_empty_strings"))?;
        values.push(value.to_string());
    }
    Ok(values)
}

fn discover_plugins(
    state: &Arc<RuntimeState>,
    roots: &[PathBuf],
    include_empty_root_issue: bool,
) -> Result<(Vec<PluginCandidate>, Vec<Value>), String> {
    let mut plugins = Vec::new();
    let mut issues = Vec::new();
    let mut visited = HashSet::new();
    let current_daw = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.target_daw.clone()
    };

    for root in roots {
        let plugin_roots = collect_plugin_roots(root)?;
        if plugin_roots.is_empty() {
            if include_empty_root_issue {
                issues.push(create_issue("plugin_root_not_found_or_empty", Some(root), None));
            }
            continue;
        }

        for plugin_root in plugin_roots {
            let normalized = plugin_root.to_string_lossy().to_string();
            if visited.contains(&normalized) {
                continue;
            }
            visited.insert(normalized);
            let manifest_path = plugin_root.join("manifest.json");
            let manifest_text = match fs::read_to_string(&manifest_path) {
                Ok(text) => text,
                Err(error) => {
                    issues.push(create_issue(
                        &format!("manifest_read_failed:{error}"),
                        Some(&plugin_root),
                        Some(&manifest_path),
                    ));
                    continue;
                }
            };
            let manifest_value = match serde_json::from_str::<Value>(&manifest_text) {
                Ok(value) => value,
                Err(error) => {
                    issues.push(create_issue(
                        &format!("manifest_read_failed:{error}"),
                        Some(&plugin_root),
                        Some(&manifest_path),
                    ));
                    continue;
                }
            };

            match validate_plugin_manifest(&manifest_value, &plugin_root, &current_daw) {
                Ok(plugin) => plugins.push(plugin),
                Err(reason) => {
                    issues.push(create_issue(&reason, Some(&plugin_root), Some(&manifest_path)))
                }
            }
        }
    }

    Ok((plugins, issues))
}

fn plugin_enabled_state_path(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(managed_plugins_root(state)?.join(".presto-plugin-enabled-state.json"))
}

fn read_plugin_enabled_state(state: &Arc<RuntimeState>) -> Result<HashMap<String, bool>, String> {
    let file_path = plugin_enabled_state_path(state)?;
    if !file_path.exists() {
        return Ok(HashMap::new());
    }
    let text = fs::read_to_string(file_path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<Value>(&text).map_err(|error| error.to_string())?;
    let mut values = HashMap::new();
    if let Some(map) = parsed.as_object() {
        for (key, value) in map {
            if let Some(flag) = value.as_bool() {
                values.insert(key.clone(), flag);
            }
        }
    }
    Ok(values)
}

fn write_plugin_enabled_state(
    state: &Arc<RuntimeState>,
    enabled_state: &HashMap<String, bool>,
) -> Result<(), String> {
    let file_path = plugin_enabled_state_path(state)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut entries = enabled_state
        .iter()
        .map(|(key, value)| (key.clone(), Value::Bool(*value)))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let object = Value::Object(entries.into_iter().collect());
    fs::write(file_path, format!("{}\n", object)).map_err(|error| error.to_string())
}

fn load_automation_records(state: &Arc<RuntimeState>) -> Result<Vec<AutomationDefinitionRecord>, String> {
    let definitions_dir = automation_definitions_dir(state)?;
    let scripts_dir = automation_scripts_dir(state)?;
    let mut file_names = fs::read_dir(definitions_dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().to_str().map(ToOwned::to_owned))
        .filter(|name| name.ends_with(".json"))
        .collect::<Vec<_>>();
    file_names.sort();

    let mut records = Vec::new();
    for file_name in file_names {
        let definition_path = automation_definitions_dir(state)?.join(&file_name);
        let source = fs::read_to_string(&definition_path).map_err(|error| error.to_string())?;
        let parsed = serde_json::from_str::<Value>(&source).map_err(|error| error.to_string())?;
        let object = parsed
            .as_object()
            .ok_or_else(|| format!("invalid_automation_definition:{file_name}"))?;
        let id = object.get("id").and_then(Value::as_str).unwrap_or_default().trim();
        let title = object
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let app = object.get("app").and_then(Value::as_str).unwrap_or_default().trim();
        let script_file = object
            .get("scriptFile")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        if id.is_empty() || title.is_empty() || app.is_empty() || script_file.is_empty() {
            continue;
        }
        let input_keys = object
            .get("inputKeys")
            .and_then(Value::as_array)
            .map(|items| {
                items.iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        records.push(AutomationDefinitionRecord {
            id: id.to_string(),
            title: title.to_string(),
            app: app.to_string(),
            description: object
                .get("description")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            script_path: scripts_dir.join(script_file),
            input_keys,
        });
    }

    Ok(records)
}

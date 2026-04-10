use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

use super::daw_targets_generated::RESERVED_DAW_TARGETS;
use super::{
    managed_plugins_root, official_plugins_root, unique_suffix, PluginCandidate, RuntimeState,
    WorkflowDefinitionRef, DEFAULT_DAW_TARGET,
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
        Ok(status) if status.success() => {
            install_plugin_from_directory(state, &extract_root, overwrite)
        }
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

    let definition_path = plugin
        .plugin_root
        .join(workflow_definition.definition_entry);
    let definition_text =
        fs::read_to_string(&definition_path).map_err(|error| error.to_string())?;
    let definition =
        serde_json::from_str::<Value>(&definition_text).map_err(|error| error.to_string())?;
    if definition
        .get("workflowId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        != workflow_id
    {
        return Err(format!(
            "workflow_definition_mismatch:{plugin_id}:{workflow_id}"
        ));
    }

    Ok(json!({
        "definition": definition,
        "allowedCapabilities": plugin.required_capabilities,
    }))
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
    _current_daw: &str,
) -> Result<PluginCandidate, String> {
    let manifest_object = manifest
        .as_object()
        .ok_or_else(|| "manifest_validation:root:must_be_object".to_string())?;
    let plugin_id = required_string_field_at(manifest_object, "pluginId", "pluginId")?;
    let display_name = required_string_field_at(manifest_object, "displayName", "displayName")?;
    let version = required_string_field_at(manifest_object, "version", "version")?;
    let entry = required_string_field_at(manifest_object, "entry", "entry")?;
    let extension_type =
        required_string_field_at(manifest_object, "extensionType", "extensionType")?;
    let host_api_version =
        required_string_field_at(manifest_object, "hostApiVersion", "hostApiVersion")?;
    let ui_runtime = required_string_field_at(manifest_object, "uiRuntime", "uiRuntime")?;

    if !matches!(host_api_version.as_str(), "0.1.0" | "1" | "1.0.0") {
        return Err("manifest_validation:hostApiVersion:unsupported_host_api_version".to_string());
    }
    if !matches!(extension_type.as_str(), "workflow" | "automation") {
        return Err("manifest_validation:extensionType:must_be_workflow_or_automation".to_string());
    }
    if ui_runtime != "react18" {
        return Err("manifest_validation:uiRuntime:must_be_react18".to_string());
    }

    let supported_daws =
        required_string_array_field_at(manifest_object, "supportedDaws", "supportedDaws")?;
    validate_unique_string_values(&supported_daws, "supportedDaws")?;
    validate_supported_daw_targets(&supported_daws)?;

    let required_capabilities = required_string_array_field_at(
        manifest_object,
        "requiredCapabilities",
        "requiredCapabilities",
    )?;
    validate_unique_string_values(&required_capabilities, "requiredCapabilities")?;
    validate_page_definitions(required_array_field(manifest_object, "pages", "pages")?)?;
    let settings_pages = manifest_object
        .get("settingsPages")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    validate_automation_items(optional_array_field(manifest_object, "automationItems")?)?;
    validate_adapter_module_requirements(optional_array_field(
        manifest_object,
        "adapterModuleRequirements",
    )?)?;
    validate_capability_requirements(optional_array_field(
        manifest_object,
        "capabilityRequirements",
    )?)?;
    validate_settings_pages(&settings_pages)?;

    if let Some(style_entry) = manifest_object.get("styleEntry") {
        if !style_entry.is_string() {
            return Err("manifest_validation:styleEntry:must_be_string_when_present".to_string());
        }
    }

    let workflow_definition = if extension_type == "workflow" {
        let workflow = manifest_object
            .get("workflowDefinition")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                "manifest_validation:workflowDefinition:required_for_workflow_plugins".to_string()
            })?;
        let workflow_id =
            required_string_field_at(workflow, "workflowId", "workflowDefinition.workflowId")?;
        let input_schema_id = required_string_field_at(
            workflow,
            "inputSchemaId",
            "workflowDefinition.inputSchemaId",
        )?;
        let definition_entry = required_string_field_at(
            workflow,
            "definitionEntry",
            "workflowDefinition.definitionEntry",
        )?;
        validate_workflow_definition_file(
            plugin_root,
            &workflow_id,
            &input_schema_id,
            &definition_entry,
            &required_capabilities,
        )?;
        Some(WorkflowDefinitionRef {
            workflow_id,
            definition_entry,
        })
    } else {
        if manifest_object.get("workflowDefinition").is_some() {
            return Err(
                "manifest_validation:workflowDefinition:unsupported_for_non_workflow_plugins"
                    .to_string(),
            );
        }
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

fn required_string_field_at(
    map: &Map<String, Value>,
    field: &str,
    path: &str,
) -> Result<String, String> {
    map.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("manifest_validation:{path}:must_be_non_empty_string"))
}

fn required_string_array_field_at(
    map: &Map<String, Value>,
    field: &str,
    path: &str,
) -> Result<Vec<String>, String> {
    let array = map
        .get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("manifest_validation:{path}:must_be_array"))?;
    let mut values = Vec::with_capacity(array.len());
    for item in array {
        let value = item
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .ok_or_else(|| format!("manifest_validation:{path}:must_contain_non_empty_strings"))?;
        values.push(value.to_string());
    }
    Ok(values)
}

fn required_array_field<'a>(
    map: &'a Map<String, Value>,
    field: &str,
    path: &str,
) -> Result<&'a Vec<Value>, String> {
    map.get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("manifest_validation:{path}:must_be_array"))
}

fn optional_array_field<'a>(
    map: &'a Map<String, Value>,
    field: &str,
) -> Result<Option<&'a Vec<Value>>, String> {
    match map.get(field) {
        None => Ok(None),
        Some(value) => value
            .as_array()
            .map(Some)
            .ok_or_else(|| format!("manifest_validation:{field}:must_be_array_when_present")),
    }
}

fn validate_unique_string_values(values: &[String], field: &str) -> Result<(), String> {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value.clone()) {
            return Err(format!(
                "manifest_validation:{field}:duplicate_value:{value}"
            ));
        }
    }
    Ok(())
}

fn validate_supported_daw_targets(values: &[String]) -> Result<(), String> {
    if values.is_empty() {
        return Err("manifest_validation:supportedDaws:must_not_be_empty".to_string());
    }
    for value in values {
        if !RESERVED_DAW_TARGETS.contains(&value.as_str()) {
            return Err(format!(
                "manifest_validation:supportedDaws:unknown_target:{value}"
            ));
        }
    }
    Ok(())
}

fn validate_page_definitions(pages: &[Value]) -> Result<(), String> {
    let mut seen_page_ids = HashSet::new();
    for (index, page) in pages.iter().enumerate() {
        let field_prefix = format!("pages[{index}]");
        let page_object = page
            .as_object()
            .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
        let page_id =
            required_string_field_at(page_object, "pageId", &format!("{field_prefix}.pageId"))?;
        required_string_field_at(page_object, "path", &format!("{field_prefix}.path"))?;
        required_string_field_at(page_object, "title", &format!("{field_prefix}.title"))?;
        required_string_field_at(
            page_object,
            "componentExport",
            &format!("{field_prefix}.componentExport"),
        )?;
        if page_object.get("mount").and_then(Value::as_str) != Some("workspace") {
            return Err(format!(
                "manifest_validation:{field_prefix}.mount:must_be_workspace"
            ));
        }
        if !seen_page_ids.insert(page_id.clone()) {
            return Err(format!(
                "manifest_validation:pages:duplicate_page_id:{page_id}"
            ));
        }
    }
    Ok(())
}

fn validate_automation_items(items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else {
        return Ok(());
    };
    let mut seen_item_ids = HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let field_prefix = format!("automationItems[{index}]");
        let item_object = item
            .as_object()
            .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
        let item_id =
            required_string_field_at(item_object, "itemId", &format!("{field_prefix}.itemId"))?;
        required_string_field_at(item_object, "title", &format!("{field_prefix}.title"))?;
        required_string_field_at(
            item_object,
            "automationType",
            &format!("{field_prefix}.automationType"),
        )?;
        required_string_field_at(
            item_object,
            "runnerExport",
            &format!("{field_prefix}.runnerExport"),
        )?;
        if let Some(description) = item_object.get("description") {
            if !description.is_string() {
                return Err(format!(
                    "manifest_validation:{field_prefix}.description:must_be_string_when_present"
                ));
            }
        }
        if let Some(order) = item_object.get("order") {
            if !order.is_number() {
                return Err(format!(
                    "manifest_validation:{field_prefix}.order:must_be_number_when_present"
                ));
            }
        }
        if !seen_item_ids.insert(item_id.clone()) {
            return Err(format!(
                "manifest_validation:automationItems:duplicate_item_id:{item_id}"
            ));
        }
    }
    Ok(())
}

fn validate_adapter_module_requirements(items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else {
        return Ok(());
    };
    for (index, item) in items.iter().enumerate() {
        let field_prefix = format!("adapterModuleRequirements[{index}]");
        let item_object = item
            .as_object()
            .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
        required_string_field_at(item_object, "moduleId", &format!("{field_prefix}.moduleId"))?;
        required_string_field_at(
            item_object,
            "minVersion",
            &format!("{field_prefix}.minVersion"),
        )?;
    }
    Ok(())
}

fn validate_capability_requirements(items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else {
        return Ok(());
    };
    for (index, item) in items.iter().enumerate() {
        let field_prefix = format!("capabilityRequirements[{index}]");
        let item_object = item
            .as_object()
            .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
        required_string_field_at(
            item_object,
            "capabilityId",
            &format!("{field_prefix}.capabilityId"),
        )?;
        required_string_field_at(
            item_object,
            "minVersion",
            &format!("{field_prefix}.minVersion"),
        )?;
    }
    Ok(())
}

fn validate_settings_pages(settings_pages: &Value) -> Result<(), String> {
    let pages = settings_pages.as_array().ok_or_else(|| {
        "manifest_validation:settingsPages:must_be_array_when_present".to_string()
    })?;
    let mut seen_page_ids = HashSet::new();
    for (index, page) in pages.iter().enumerate() {
        let field_prefix = format!("settingsPages[{index}]");
        let page_object = page
            .as_object()
            .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
        let page_id =
            required_string_field_at(page_object, "pageId", &format!("{field_prefix}.pageId"))?;
        required_string_field_at(page_object, "title", &format!("{field_prefix}.title"))?;
        required_string_field_at(
            page_object,
            "storageKey",
            &format!("{field_prefix}.storageKey"),
        )?;
        required_string_field_at(
            page_object,
            "loadExport",
            &format!("{field_prefix}.loadExport"),
        )?;
        required_string_field_at(
            page_object,
            "saveExport",
            &format!("{field_prefix}.saveExport"),
        )?;
        if !page_object
            .get("defaults")
            .map(Value::is_object)
            .unwrap_or(false)
        {
            return Err(format!(
                "manifest_validation:{field_prefix}.defaults:must_be_object"
            ));
        }
        let sections = page_object
            .get("sections")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("manifest_validation:{field_prefix}.sections:must_be_array"))?;
        for (section_index, section) in sections.iter().enumerate() {
            validate_settings_section(section, &field_prefix, section_index)?;
        }
        if !seen_page_ids.insert(page_id.clone()) {
            return Err(format!(
                "manifest_validation:settingsPages:duplicate_page_id:{page_id}"
            ));
        }
    }
    Ok(())
}

fn validate_settings_section(
    section: &Value,
    page_field: &str,
    section_index: usize,
) -> Result<(), String> {
    let field_prefix = format!("{page_field}.sections[{section_index}]");
    let section_object = section
        .as_object()
        .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
    required_string_field_at(
        section_object,
        "sectionId",
        &format!("{field_prefix}.sectionId"),
    )?;
    required_string_field_at(section_object, "title", &format!("{field_prefix}.title"))?;
    if let Some(description) = section_object.get("description") {
        if !description.is_string() {
            return Err(format!(
                "manifest_validation:{field_prefix}.description:must_be_string_when_present"
            ));
        }
    }
    let fields = section_object
        .get("fields")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("manifest_validation:{field_prefix}.fields:must_be_array"))?;
    for (field_index, field) in fields.iter().enumerate() {
        validate_settings_field(field, page_field, section_index, field_index)?;
    }
    Ok(())
}

fn validate_settings_field(
    field: &Value,
    page_field: &str,
    section_index: usize,
    field_index: usize,
) -> Result<(), String> {
    let field_prefix = format!("{page_field}.sections[{section_index}].fields[{field_index}]");
    let field_object = field
        .as_object()
        .ok_or_else(|| format!("manifest_validation:{field_prefix}:must_be_object"))?;
    required_string_field_at(field_object, "fieldId", &format!("{field_prefix}.fieldId"))?;
    let kind = required_string_field_at(field_object, "kind", &format!("{field_prefix}.kind"))?;
    required_string_field_at(field_object, "label", &format!("{field_prefix}.label"))?;
    required_string_field_at(field_object, "path", &format!("{field_prefix}.path"))?;
    if let Some(description) = field_object.get("description") {
        if !description.is_string() {
            return Err(format!(
                "manifest_validation:{field_prefix}.description:must_be_string_when_present"
            ));
        }
    }
    if !matches!(
        kind.as_str(),
        "toggle" | "select" | "text" | "password" | "textarea" | "number" | "categoryList"
    ) {
        return Err(format!(
            "manifest_validation:{field_prefix}.kind:unsupported_field_kind"
        ));
    }
    if kind == "select" {
        let options = field_object
            .get("options")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("manifest_validation:{field_prefix}.options:must_be_array"))?;
        for (option_index, option) in options.iter().enumerate() {
            let option_prefix = format!("{field_prefix}.options[{option_index}]");
            let option_object = option
                .as_object()
                .ok_or_else(|| format!("manifest_validation:{option_prefix}:must_be_object"))?;
            required_string_field_at(option_object, "value", &format!("{option_prefix}.value"))?;
            required_string_field_at(option_object, "label", &format!("{option_prefix}.label"))?;
        }
    }
    if kind == "toggle" {
        if let Some(value) = field_object.get("checkedValue") {
            if !is_primitive_value(value) {
                return Err(format!(
                    "manifest_validation:{field_prefix}.checkedValue:must_be_primitive_when_present"
                ));
            }
        }
        if let Some(value) = field_object.get("uncheckedValue") {
            if !is_primitive_value(value) {
                return Err(format!(
                    "manifest_validation:{field_prefix}.uncheckedValue:must_be_primitive_when_present"
                ));
            }
        }
    }
    if kind == "number" {
        for field_name in ["min", "max", "step"] {
            if let Some(value) = field_object.get(field_name) {
                if !value.is_number() {
                    return Err(format!(
                        "manifest_validation:{field_prefix}.{field_name}:must_be_number_when_present"
                    ));
                }
            }
        }
    }
    if matches!(kind.as_str(), "text" | "password" | "textarea") {
        if let Some(placeholder) = field_object.get("placeholder") {
            if !placeholder.is_string() {
                return Err(format!(
                    "manifest_validation:{field_prefix}.placeholder:must_be_string_when_present"
                ));
            }
        }
    }
    Ok(())
}

fn is_primitive_value(value: &Value) -> bool {
    value.is_string() || value.is_number() || value.is_boolean()
}

fn validate_workflow_definition_file(
    plugin_root: &Path,
    workflow_id: &str,
    input_schema_id: &str,
    definition_entry: &str,
    required_capabilities: &[String],
) -> Result<(), String> {
    let definition_path = plugin_root.join(definition_entry);
    if !definition_path.exists() {
        return Err(
            "manifest_validation:workflowDefinition.definitionEntry:file_not_found".to_string(),
        );
    }
    let definition_text = fs::read_to_string(&definition_path).map_err(|_| {
        "manifest_validation:workflowDefinition.definitionEntry:definition_read_failed".to_string()
    })?;
    let definition = serde_json::from_str::<Value>(&definition_text).map_err(|_| {
        "manifest_validation:workflowDefinition.definitionEntry:definition_read_failed".to_string()
    })?;
    let definition_object = definition.as_object().ok_or_else(|| {
        "manifest_validation:workflowDefinition.definitionEntry:must_be_object".to_string()
    })?;
    let definition_workflow_id = required_string_field_at(
        definition_object,
        "workflowId",
        "workflowDefinition.workflowId",
    )?;
    if definition_workflow_id != workflow_id {
        return Err(
            "manifest_validation:workflowDefinition.workflowId:must_match_reference".to_string(),
        );
    }
    required_string_field_at(definition_object, "version", "workflowDefinition.version")?;
    let definition_input_schema_id = required_string_field_at(
        definition_object,
        "inputSchemaId",
        "workflowDefinition.inputSchemaId",
    )?;
    if definition_input_schema_id != input_schema_id {
        return Err(
            "manifest_validation:workflowDefinition.inputSchemaId:must_match_reference".to_string(),
        );
    }
    let steps = definition_object
        .get("steps")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "manifest_validation:workflowDefinition.steps:must_be_non_empty_array".to_string()
        })?;
    if steps.is_empty() {
        return Err(
            "manifest_validation:workflowDefinition.steps:must_be_non_empty_array".to_string(),
        );
    }
    let required_capability_set = required_capabilities
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let mut used_capabilities = HashSet::new();
    for step in steps {
        collect_workflow_capability_ids(step, &mut used_capabilities);
    }
    let mut undeclared_capabilities = used_capabilities
        .into_iter()
        .filter(|capability_id| !required_capability_set.contains(capability_id))
        .collect::<Vec<_>>();
    undeclared_capabilities.sort();
    if let Some(capability_id) = undeclared_capabilities.into_iter().next() {
        return Err(format!(
            "manifest_validation:workflowDefinition:uses_capability_not_declared:{capability_id}"
        ));
    }
    Ok(())
}

fn collect_workflow_capability_ids(step: &Value, collected: &mut HashSet<String>) {
    let Some(step_object) = step.as_object() else {
        return;
    };
    if let Some(capability_id) = step_object.get("usesCapability").and_then(Value::as_str) {
        collected.insert(capability_id.to_string());
    }
    if let Some(nested_steps) = step_object.get("steps").and_then(Value::as_array) {
        for nested_step in nested_steps {
            collect_workflow_capability_ids(nested_step, collected);
        }
    }
}

fn discover_plugins(
    _state: &Arc<RuntimeState>,
    roots: &[PathBuf],
    include_empty_root_issue: bool,
) -> Result<(Vec<PluginCandidate>, Vec<Value>), String> {
    let mut plugins = Vec::new();
    let mut issues = Vec::new();
    let mut visited = HashSet::new();

    for root in roots {
        let plugin_roots = collect_plugin_roots(root)?;
        if plugin_roots.is_empty() {
            if include_empty_root_issue {
                issues.push(create_issue(
                    "plugin_root_not_found_or_empty",
                    Some(root),
                    None,
                ));
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

            match validate_plugin_manifest(&manifest_value, &plugin_root, DEFAULT_DAW_TARGET) {
                Ok(plugin) => plugins.push(plugin),
                Err(reason) => issues.push(create_issue(
                    &reason,
                    Some(&plugin_root),
                    Some(&manifest_path),
                )),
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

#[cfg(test)]
mod tests {
    use super::validate_plugin_manifest;
    use serde_json::json;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_plugin_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "presto-runtime-plugin-validation-{}-{}",
            std::process::id(),
            unique
        ));
        fs::create_dir_all(root.join("dist")).unwrap();
        root
    }

    fn write_workflow_definition(path: &Path, definition: serde_json::Value) {
        fs::write(path, format!("{definition}\n")).unwrap();
    }

    #[test]
    fn plugin_manifest_validation_does_not_reject_plugins_reserved_for_other_daws() {
        let plugin_root = temp_plugin_root();
        let manifest = json!({
            "pluginId": "plugin.logic.example",
            "extensionType": "automation",
            "version": "1.0.0",
            "hostApiVersion": "1.0.0",
            "uiRuntime": "react18",
            "supportedDaws": ["logic"],
            "displayName": "Logic Example",
            "entry": "dist/index.js",
            "requiredCapabilities": ["system.health"],
            "pages": [{
                "pageId": "main",
                "path": "/logic-example",
                "title": "Logic Example",
                "mount": "workspace",
                "componentExport": "MainPage"
            }]
        });

        let result = validate_plugin_manifest(&manifest, &plugin_root, "pro_tools");
        let _ = fs::remove_dir_all(&plugin_root);

        assert!(result.is_ok());
    }

    #[test]
    fn plugin_manifest_validation_rejects_workflow_definitions_using_undeclared_capabilities() {
        let plugin_root = temp_plugin_root();
        write_workflow_definition(
            &plugin_root.join("dist/workflow-definition.json"),
            json!({
                "workflowId": "plugin.workflow.example.run",
                "version": "1.0.0",
                "inputSchemaId": "plugin.workflow.example.input.v1",
                "steps": [{
                    "stepId": "rename",
                    "usesCapability": "track.rename",
                    "input": {
                        "trackNames": ["DX"],
                        "newName": "VO"
                    }
                }]
            }),
        );

        let manifest = json!({
            "pluginId": "plugin.workflow.example",
            "extensionType": "workflow",
            "version": "1.0.0",
            "hostApiVersion": "1.0.0",
            "uiRuntime": "react18",
            "supportedDaws": ["pro_tools"],
            "displayName": "Workflow Example",
            "entry": "dist/index.js",
            "requiredCapabilities": ["system.health"],
            "pages": [{
                "pageId": "main",
                "path": "/workflow-example",
                "title": "Workflow Example",
                "mount": "workspace",
                "componentExport": "MainPage"
            }],
            "workflowDefinition": {
                "workflowId": "plugin.workflow.example.run",
                "inputSchemaId": "plugin.workflow.example.input.v1",
                "definitionEntry": "dist/workflow-definition.json"
            }
        });

        let result = validate_plugin_manifest(&manifest, &plugin_root, "pro_tools");
        let _ = fs::remove_dir_all(&plugin_root);

        match result {
            Ok(_) => panic!("expected manifest validation failure"),
            Err(error) => assert_eq!(
                error,
                "manifest_validation:workflowDefinition:uses_capability_not_declared:track.rename"
            ),
        }
    }
}

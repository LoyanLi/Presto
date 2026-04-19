mod backend;
mod daw_targets_generated;
mod mobile_progress;
mod plugins;

use daw_targets_generated::{DEFAULT_DAW_TARGET, SUPPORTED_DAW_TARGETS};
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DEFAULT_PORT: u16 = 18_500;
const PYTHON_VERSION: &str = "3.13";
const ACCESSIBILITY_PERMISSION_REQUIRED: &str = "MAC_ACCESSIBILITY_PERMISSION_REQUIRED";

pub struct RuntimeState {
    app: AppHandle,
    log_state: Mutex<LogState>,
    backend_state: Mutex<BackendSupervisorState>,
    mobile_state: Mutex<MobileProgressState>,
}

struct LogState {
    current_log_path: PathBuf,
    next_id: u64,
}

struct BackendSupervisorState {
    phase: String,
    last_error: Option<String>,
    logs_count: u64,
    port: u16,
    pid: Option<u32>,
    child: Option<Child>,
    target_daw: String,
}

#[derive(Clone)]
struct MobileProgressSessionRecord {
    session_id: String,
    token: String,
    task_id: String,
    latest_job_view: Option<Value>,
    created_at: String,
    updated_at: String,
    active: bool,
    closed_at: Option<String>,
}

struct MobileProgressState {
    origin: Option<String>,
    server_started: bool,
    sessions: HashMap<String, MobileProgressSessionRecord>,
}

#[derive(Clone)]
struct PluginCandidate {
    plugin_root: PathBuf,
    manifest_path: PathBuf,
    manifest: Value,
    plugin_id: String,
    display_name: String,
    version: String,
    entry: String,
    settings_pages: Value,
    required_capabilities: Vec<String>,
    workflow_definition: Option<WorkflowDefinitionRef>,
}

#[derive(Clone)]
struct WorkflowDefinitionRef {
    workflow_id: String,
    definition_entry: String,
}

#[derive(Clone)]
enum VersionPart {
    Number(u64),
    Text(String),
}

#[derive(Clone)]
struct ParsedVersion {
    major: u64,
    minor: u64,
    patch: u64,
    prerelease: Option<Vec<VersionPart>>,
}

pub fn initialize(app: AppHandle) -> Result<RuntimeState, String> {
    let log_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs");
    fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    let session_stamp = timestamp_for_file_name();
    let current_log_path = log_dir.join(format!("presto-{session_stamp}.log"));
    ensure_file(&current_log_path)?;

    let initial_backend_target_daw = load_initial_backend_target_daw(&app)?;

    let state = RuntimeState {
        app,
        log_state: Mutex::new(LogState {
            current_log_path,
            next_id: 1,
        }),
        backend_state: Mutex::new(BackendSupervisorState {
            phase: "stopped".to_string(),
            last_error: None,
            logs_count: 0,
            port: DEFAULT_PORT,
            pid: None,
            child: None,
            target_daw: initial_backend_target_daw,
        }),
        mobile_state: Mutex::new(MobileProgressState {
            origin: None,
            server_started: false,
            sessions: HashMap::new(),
        }),
    };

    let wrapped = Arc::new(state);
    plugins::sync_official_plugins(&wrapped)?;
    Arc::try_unwrap(wrapped).map_err(|_| "runtime_state_init_failed".to_string())
}

pub fn invoke(
    state: &Arc<RuntimeState>,
    operation: &str,
    args: Vec<Value>,
) -> Result<Value, String> {
    match operation {
        "app.log.current-path.get" => Ok(json!({
            "filePath": current_log_path(state)?,
        })),
        "app.log.view" => {
            let file_path = current_log_path(state)?;
            open_log_in_console(&file_path)?;
            Ok(json!({
                "ok": true,
                "filePath": file_path,
            }))
        }
        "app.release.check" => check_for_updates(state, args.first()),
        "dialog.open" => open_dialog(args.first()),
        "process.bundled.exec" => execute_bundled_process(state, args.first()),
        "shell.path.open" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            open_with_system(target)
        }
        "shell.external.open" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            open_external(target)
        }
        "fs.file.read" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            match fs::read_to_string(target) {
                Ok(content) => Ok(Value::String(content)),
                Err(_) => Ok(Value::Null),
            }
        }
        "fs.file.write" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            let content = args.get(1).and_then(Value::as_str).unwrap_or_default();
            fs::write(target, content).map_err(|error| error.to_string())?;
            Ok(Value::Bool(true))
        }
        "fs.dir.ensure" | "fs.dir.create" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            fs::create_dir_all(target).map_err(|error| error.to_string())?;
            Ok(Value::Bool(true))
        }
        "fs.home-path.get" => Ok(Value::String(
            std::env::var("HOME").map_err(|error| error.to_string())?,
        )),
        "fs.path.exists" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            Ok(Value::Bool(PathBuf::from(target).exists()))
        }
        "fs.path.stat" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            match fs::metadata(target) {
                Ok(metadata) => Ok(json!({
                    "isFile": metadata.is_file(),
                    "isDirectory": metadata.is_dir(),
                })),
                Err(_) => Ok(Value::Null),
            }
        }
        "fs.dir.read" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            let mut entries = Vec::new();
            for entry in fs::read_dir(target).map_err(|error| error.to_string())? {
                let item = entry.map_err(|error| error.to_string())?;
                if let Some(name) = item.file_name().to_str() {
                    entries.push(Value::String(name.to_string()));
                }
            }
            Ok(Value::Array(entries))
        }
        "fs.file.unlink" | "fs.file.delete" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            fs::remove_file(target).map_err(|error| error.to_string())?;
            Ok(Value::Bool(true))
        }
        "fs.dir.remove" => {
            let target = args.first().and_then(Value::as_str).unwrap_or_default();
            fs::remove_dir_all(target).map_err(|error| error.to_string())?;
            Ok(Value::Bool(true))
        }
        "window.always-on-top.get" => {
            let window = state
                .app
                .get_webview_window("main")
                .ok_or_else(|| "missing_main_window".to_string())?;
            Ok(Value::Bool(
                window
                    .is_always_on_top()
                    .map_err(|error| error.to_string())?,
            ))
        }
        "window.always-on-top.set" => {
            let window = state
                .app
                .get_webview_window("main")
                .ok_or_else(|| "missing_main_window".to_string())?;
            let enabled = args.first().and_then(Value::as_bool).unwrap_or(false);
            window
                .set_always_on_top(enabled)
                .map_err(|error| error.to_string())?;
            Ok(Value::Bool(enabled))
        }
        "window.always-on-top.toggle" => {
            let window = state
                .app
                .get_webview_window("main")
                .ok_or_else(|| "missing_main_window".to_string())?;
            let next = !window
                .is_always_on_top()
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_top(next)
                .map_err(|error| error.to_string())?;
            Ok(Value::Bool(next))
        }
        "backend.status.get" => backend::backend_status(state),
        "backend.capabilities.list" => backend::backend_capabilities(state),
        "backend.lifecycle.restart" => backend::restart_backend(state),
        "backend.daw-adapter.snapshot.get" => backend::load_daw_adapter_snapshot(state),
        "backend.daw-target.set" => {
            let next_target = args.first().and_then(Value::as_str).unwrap_or_default();
            backend::set_backend_daw_target(state, next_target)
        }
        "backend.developer-mode.set" => {
            let enabled = args.first().and_then(Value::as_bool).unwrap_or(false);
            backend::set_backend_developer_mode(state, enabled)
        }
        "backend.capability.invoke" => {
            let request = args.first().cloned().unwrap_or(Value::Null);
            backend::invoke_backend_capability(state, request)
        }
        "plugins.catalog.list" => plugins::list_plugins(state),
        "plugins.install.directory" => {
            let overwrite = args.first().and_then(Value::as_bool).unwrap_or(false);
            match rfd::FileDialog::new().pick_folder() {
                Some(path) => plugins::install_plugin_from_directory(state, &path, overwrite),
                None => Ok(json!({
                    "ok": false,
                    "cancelled": true,
                    "managedPluginsRoot": managed_plugins_root(state)?.to_string_lossy().to_string(),
                    "issues": [],
                })),
            }
        }
        "plugins.install.zip" => {
            let overwrite = args.first().and_then(Value::as_bool).unwrap_or(false);
            match rfd::FileDialog::new()
                .add_filter("Plugin Zip", &["zip"])
                .pick_file()
            {
                Some(path) => plugins::install_plugin_from_zip(state, &path, overwrite),
                None => Ok(json!({
                    "ok": false,
                    "cancelled": true,
                    "managedPluginsRoot": managed_plugins_root(state)?.to_string_lossy().to_string(),
                    "issues": [],
                })),
            }
        }
        "plugins.install.directory.selected" => {
            let selected = args.first().and_then(Value::as_str).unwrap_or_default();
            let overwrite = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            plugins::install_plugin_from_directory(state, &PathBuf::from(selected), overwrite)
        }
        "plugins.install.zip.selected" => {
            let zip_path = args.first().and_then(Value::as_str).unwrap_or_default();
            let overwrite = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            plugins::install_plugin_from_zip(state, &PathBuf::from(zip_path), overwrite)
        }
        "plugins.set-enabled" => {
            let plugin_id = args.first().and_then(Value::as_str).unwrap_or_default();
            let enabled = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            plugins::set_plugin_enabled(state, plugin_id, enabled)
        }
        "plugins.uninstall" => {
            let plugin_id = args.first().and_then(Value::as_str).unwrap_or_default();
            plugins::uninstall_plugin(state, plugin_id)
        }
        "mobile-progress.session.create" => {
            let task_id = args.first().and_then(Value::as_str).unwrap_or_default();
            mobile_progress::create_mobile_progress_session(state, task_id)
        }
        "mobile-progress.session.close" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            mobile_progress::close_mobile_progress_session(state, session_id)
        }
        "mobile-progress.view-url.get" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            mobile_progress::get_mobile_progress_view_url(state, session_id)
        }
        "mobile-progress.session.update" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            let payload = args.get(1).cloned();
            mobile_progress::update_mobile_progress_session(state, session_id, payload)
        }
        "mac-accessibility.preflight" => mac_accessibility_preflight(),
        "mac-accessibility.script.run" => {
            let script = args.first().and_then(Value::as_str).unwrap_or_default();
            let script_args = to_string_vec(args.get(1));
            run_mac_accessibility_script(script, &script_args)
        }
        "mac-accessibility.file.run" => {
            let file_path = args.first().and_then(Value::as_str).unwrap_or_default();
            let script_args = to_string_vec(args.get(1));
            run_mac_accessibility_file(file_path, &script_args)
        }
        _ => Err(format!("unsupported_operation:{operation}")),
    }
}

fn current_log_path(state: &Arc<RuntimeState>) -> Result<String, String> {
    let log_state = state
        .log_state
        .lock()
        .map_err(|_| "log_lock_failed".to_string())?;
    Ok(log_state.current_log_path.to_string_lossy().to_string())
}

fn load_initial_backend_target_daw(app: &AppHandle) -> Result<String, String> {
    let config_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("config.json");
    Ok(load_initial_backend_target_daw_from_path(&config_path))
}

fn load_initial_backend_target_daw_from_path(config_path: &Path) -> String {
    let raw = match fs::read_to_string(config_path) {
        Ok(contents) => contents,
        Err(_) => return DEFAULT_DAW_TARGET.to_string(),
    };
    load_initial_backend_target_daw_from_contents(&raw)
}

fn load_initial_backend_target_daw_from_contents(raw: &str) -> String {
    let parsed = match serde_json::from_str::<Value>(raw) {
        Ok(value) => value,
        Err(_) => return DEFAULT_DAW_TARGET.to_string(),
    };
    let target = parsed
        .get("hostPreferences")
        .and_then(Value::as_object)
        .and_then(|host_preferences| host_preferences.get("dawTarget"))
        .and_then(Value::as_str)
        .unwrap_or_default();

    if SUPPORTED_DAW_TARGETS.contains(&target) {
        target.to_string()
    } else {
        DEFAULT_DAW_TARGET.to_string()
    }
}

fn ensure_file(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn timestamp_now() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0));
    format!("{}.{:03}Z", duration.as_secs(), duration.subsec_millis())
}

fn timestamp_for_file_name() -> String {
    timestamp_now().replace(':', "-")
}

fn append_log(
    state: &Arc<RuntimeState>,
    level: &str,
    source: &str,
    message: &str,
    details: Option<Value>,
) -> Result<(), String> {
    let mut log_state = state
        .log_state
        .lock()
        .map_err(|_| "log_lock_failed".to_string())?;
    log_state.next_id += 1;
    ensure_file(&log_state.current_log_path)?;
    let mut content = format!("[{}] [{}] [{}] {}", timestamp_now(), level, source, message);
    if let Some(details_value) = details {
        content.push('\n');
        content.push_str(&details_value.to_string());
    }
    content.push_str("\n\n");
    fs::OpenOptions::new()
        .append(true)
        .open(&log_state.current_log_path)
        .and_then(|mut file| file.write_all(content.as_bytes()))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn increment_backend_log_count(state: &Arc<RuntimeState>) -> Result<(), String> {
    let mut backend = state
        .backend_state
        .lock()
        .map_err(|_| "backend_lock_failed".to_string())?;
    backend.logs_count += 1;
    Ok(())
}

fn log_backend_message(
    state: &Arc<RuntimeState>,
    level: &str,
    message: &str,
    details: Option<Value>,
) -> Result<(), String> {
    increment_backend_log_count(state)?;
    append_log(state, level, "backend.supervisor", message, details)
}

fn app_data_dir(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    state
        .app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())
}

fn managed_plugins_root(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(app_data_dir(state)?.join("extensions"))
}

fn official_plugins_root(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(crate::resolve_runtime_resources_dir(&state.app)?
        .join("plugins")
        .join("official"))
}

fn backend_root(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(crate::resolve_runtime_resources_dir(&state.app)?
        .join("backend")
        .join("presto"))
}

fn resolve_bundled_python_bin(state: &Arc<RuntimeState>) -> Result<Option<PathBuf>, String> {
    let candidate = crate::resolve_runtime_resources_dir(&state.app)?
        .join("backend")
        .join("python")
        .join("bin")
        .join("python3");
    Ok(candidate.exists().then_some(candidate))
}

fn resolve_bundled_python_home(state: &Arc<RuntimeState>) -> Result<Option<PathBuf>, String> {
    let candidate = crate::resolve_runtime_resources_dir(&state.app)?
        .join("backend")
        .join("python")
        .join("Frameworks")
        .join("Python.framework")
        .join("Versions")
        .join(PYTHON_VERSION);
    Ok(candidate.exists().then_some(candidate))
}

fn resolve_backend_python_bin(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    if let Some(bundled) = resolve_bundled_python_bin(state)? {
        return Ok(bundled);
    }

    if let Ok(explicit) = std::env::var("PRESTO_PYTHON_BIN") {
        return Ok(PathBuf::from(explicit));
    }
    if let Ok(explicit) = std::env::var("PYTHON_BIN") {
        return Ok(PathBuf::from(explicit));
    }

    for candidate in [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ] {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err("python3_not_found".to_string())
}

fn open_log_in_console(path: &str) -> Result<(), String> {
    let status = Command::new("open")
        .arg("-a")
        .arg("Console")
        .arg(path)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("open_console_failed".to_string())
    }
}

fn open_with_system(target: &str) -> Result<Value, String> {
    let status = Command::new("open")
        .arg(target)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(Value::String(String::new()))
    } else {
        Err("open_command_failed".to_string())
    }
}

fn open_external(target: &str) -> Result<Value, String> {
    let status = Command::new("open")
        .arg(target)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(Value::Bool(true))
    } else {
        Err("open_external_failed".to_string())
    }
}

fn open_dialog(request: Option<&Value>) -> Result<Value, String> {
    let properties = to_string_vec(request.and_then(|value| value.get("properties")));
    let mut dialog = rfd::FileDialog::new();
    let filters = request
        .and_then(|value| value.get("filters"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for filter in filters {
        let name = filter
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let extensions = filter
            .get("extensions")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if !name.is_empty() && !extensions.is_empty() {
            dialog = dialog.add_filter(name, &extensions);
        }
    }

    let selection = if properties.iter().any(|property| property == "openFile") {
        dialog.pick_file()
    } else if properties
        .iter()
        .any(|property| property == "openDirectory")
    {
        dialog.pick_folder()
    } else {
        return Err("unsupported_dialog_properties".to_string());
    };

    Ok(match selection {
        Some(path) => json!({
            "canceled": false,
            "filePaths": [path.to_string_lossy().to_string()],
        }),
        None => json!({
            "canceled": true,
            "filePaths": [],
        }),
    })
}

fn to_string_map(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn build_process_error(
    code: &str,
    message: String,
    details: Option<Map<String, Value>>,
    stderr: Option<String>,
) -> Value {
    let mut object = Map::new();
    object.insert("ok".to_string(), Value::Bool(false));
    object.insert("exitCode".to_string(), Value::Number((-1).into()));
    object.insert("stdout".to_string(), Value::String(String::new()));
    if let Some(stderr_text) = stderr.filter(|value| !value.is_empty()) {
        object.insert("stderr".to_string(), Value::String(stderr_text));
    }
    object.insert(
        "error".to_string(),
        json!({
            "code": code,
            "message": message,
            "details": details.unwrap_or_default(),
        }),
    );
    Value::Object(object)
}

fn execute_bundled_process(
    state: &Arc<RuntimeState>,
    request: Option<&Value>,
) -> Result<Value, String> {
    let plugin_id = request
        .and_then(|value| value.get("pluginId"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let resource_id = request
        .and_then(|value| value.get("resourceId"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let args = to_string_vec(request.and_then(|value| value.get("args")));
    let options = request.and_then(|value| value.get("options"));
    let cwd = options
        .and_then(|value| value.get("cwd"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let env = to_string_map(options.and_then(|value| value.get("env")));

    if plugin_id.is_empty() {
        return Ok(build_process_error(
            "PLUGIN_ID_REQUIRED",
            "Bundled process execution requires pluginId.".to_string(),
            None,
            None,
        ));
    }

    if resource_id.is_empty() {
        return Ok(build_process_error(
            "RESOURCE_ID_REQUIRED",
            "Bundled process execution requires resourceId.".to_string(),
            None,
            None,
        ));
    }

    let Some(plugin) = plugins::resolve_plugin_candidate(state, &plugin_id)? else {
        return Ok(build_process_error(
            "PLUGIN_NOT_FOUND",
            format!("Bundled process plugin \"{plugin_id}\" was not found."),
            None,
            None,
        ));
    };

    let tool_runtime_permissions = plugin
        .manifest
        .get("toolRuntimePermissions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let allows_bundled_process = tool_runtime_permissions.iter().any(|value| {
        value
            .as_str()
            .map(|permission| permission == "process.execBundled")
            .unwrap_or(false)
    });
    if !allows_bundled_process {
        let mut details = Map::new();
        details.insert("pluginId".to_string(), Value::String(plugin_id.clone()));
        details.insert("resourceId".to_string(), Value::String(resource_id.clone()));
        return Ok(build_process_error(
            "PLUGIN_TOOL_PERMISSION_DENIED",
            format!("Plugin \"{plugin_id}\" is not allowed to access process.execBundled."),
            Some(details),
            None,
        ));
    }

    let bundled_resources = plugin
        .manifest
        .get("bundledResources")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(resource) = bundled_resources.into_iter().find(|entry| {
        entry
            .get("resourceId")
            .and_then(Value::as_str)
            .map(|value| value == resource_id)
            .unwrap_or(false)
    }) else {
        return Ok(build_process_error(
            "BUNDLED_RESOURCE_NOT_FOUND",
            format!("Bundled resource \"{resource_id}\" is not declared for plugin \"{plugin_id}\"."),
            None,
            None,
        ));
    };

    let resource_kind = resource
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let relative_path = resource
        .get("relativePath")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    if relative_path.is_empty() {
        return Ok(build_process_error(
            "BUNDLED_RESOURCE_PATH_INVALID",
            format!("Bundled resource \"{resource_id}\" is missing relativePath."),
            None,
            None,
        ));
    }

    let executable_path = match plugins::resolve_plugin_relative_path(
        &plugin.plugin_root,
        &relative_path,
        true,
    ) {
        Ok(path) => path,
        Err(_) => {
            return Ok(build_process_error(
                "BUNDLED_RESOURCE_PATH_INVALID",
                format!("Bundled resource \"{resource_id}\" has an invalid relativePath."),
                None,
                None,
            ));
        }
    };
    if !executable_path.exists() {
        let mut details = Map::new();
        details.insert(
            "path".to_string(),
            Value::String(executable_path.to_string_lossy().to_string()),
        );
        return Ok(build_process_error(
            "BUNDLED_RESOURCE_MISSING",
            format!("Bundled resource \"{resource_id}\" does not exist on disk."),
            Some(details),
            None,
        ));
    }

    let mut command = Command::new(&executable_path);
    command.args(&args);
    if let Some(cwd_path) = cwd.as_ref() {
        command.current_dir(cwd_path);
    }
    for (key, value) in env {
        if let Some(value_text) = value.as_str() {
            command.env(&key, value_text);
        }
    }

    let capture = match run_command_capture(&mut command) {
        Ok(result) => result,
        Err(error) => {
            let mut details = Map::new();
            details.insert("pluginId".to_string(), Value::String(plugin_id.clone()));
            details.insert("resourceId".to_string(), Value::String(resource_id.clone()));
            details.insert("kind".to_string(), Value::String(resource_kind));
            details.insert(
                "path".to_string(),
                Value::String(executable_path.to_string_lossy().to_string()),
            );
            details.insert(
                "args".to_string(),
                Value::Array(args.iter().cloned().map(Value::String).collect()),
            );
            return Ok(build_process_error(
                "BUNDLED_PROCESS_EXEC_FAILED",
                format!(
                    "Bundled process launch failed for plugin \"{}\" and resource \"{}\": {}",
                    plugin_id, resource_id, error
                ),
                Some(details),
                Some(error),
            ));
        }
    };

    let mut object = Map::new();
    object.insert("ok".to_string(), Value::Bool(capture.success));
    object.insert(
        "exitCode".to_string(),
        Value::Number(serde_json::Number::from(capture.exit_code)),
    );
    object.insert("stdout".to_string(), Value::String(capture.output_text.clone()));
    if !capture.stderr_text.is_empty() {
        object.insert(
            "stderr".to_string(),
            Value::String(capture.stderr_text.clone()),
        );
    }
    if !capture.success {
        let mut details = Map::new();
        details.insert("pluginId".to_string(), Value::String(plugin_id.clone()));
        details.insert("resourceId".to_string(), Value::String(resource_id.clone()));
        details.insert("kind".to_string(), Value::String(resource_kind));
        details.insert(
            "path".to_string(),
            Value::String(executable_path.to_string_lossy().to_string()),
        );
        details.insert(
            "args".to_string(),
            Value::Array(args.into_iter().map(Value::String).collect()),
        );
        details.insert(
            "exitCode".to_string(),
            Value::Number(serde_json::Number::from(capture.exit_code)),
        );
        let message = if !capture.stderr_text.is_empty() {
            capture.stderr_text.clone()
        } else if !capture.output_text.is_empty() {
            capture.output_text.clone()
        } else {
            format!(
                "Bundled process exited with code {} for plugin \"{}\" and resource \"{}\".",
                capture.exit_code, plugin_id, resource_id
            )
        };
        object.insert(
            "error".to_string(),
            json!({
                "code": "BUNDLED_PROCESS_EXIT_NONZERO",
                "message": message,
                "details": details,
            }),
        );
    }
    Ok(Value::Object(object))
}

fn std_out_key() -> String {
    ["std", "out"].concat()
}

fn to_string_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| item.as_str().unwrap_or_default().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn mac_accessibility_preflight() -> Result<Value, String> {
    if cfg!(target_os = "macos") {
        let result = run_process_capture(
            "osascript",
            &[
                "-e",
                r#"tell application "System Events" to return UI elements enabled"#,
            ],
        )?;
        if !result.success {
            let error_code = if is_accessibility_permission_denied(&result.stderr_text) {
                ACCESSIBILITY_PERMISSION_REQUIRED
            } else {
                "MAC_ACCESSIBILITY_EXECUTION_FAILED"
            };
            return Ok(json!({
                "ok": false,
                "trusted": false,
                "error": error_code,
            }));
        }
        let trusted = result.output_text.eq_ignore_ascii_case("true") || result.output_text == "1";
        Ok(json!({
            "ok": true,
            "trusted": trusted,
        }))
    } else {
        Ok(json!({
            "ok": false,
            "trusted": false,
            "error": "MAC_ACCESSIBILITY_UNSUPPORTED",
        }))
    }
}

fn run_mac_accessibility_script(script: &str, args: &[String]) -> Result<Value, String> {
    if !cfg!(target_os = "macos") {
        return Ok(unsupported_mac_accessibility_execution());
    }
    let mut command_args = vec!["-e".to_string(), script.to_string()];
    command_args.extend(args.iter().cloned());
    run_mac_accessibility_command(command_args)
}

fn run_mac_accessibility_file(file_path: &str, args: &[String]) -> Result<Value, String> {
    if !cfg!(target_os = "macos") {
        return Ok(unsupported_mac_accessibility_execution());
    }
    let extension = Path::new(file_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension != "scpt" && extension != "applescript" {
        return Ok(json!({
            "ok": false,
            "stdout": "",
            "stderr": "",
            "error": {
                "code": "MAC_ACCESSIBILITY_INVALID_FILE_TYPE",
                "message": "Only .scpt and .applescript files are supported.",
                "details": {
                    "path": file_path,
                },
            },
        }));
    }
    let mut command_args = vec![file_path.to_string()];
    command_args.extend(args.iter().cloned());
    run_mac_accessibility_command(command_args)
}

fn unsupported_mac_accessibility_execution() -> Value {
    json!({
        "ok": false,
        "stdout": "",
        "stderr": "",
        "error": {
            "code": "MAC_ACCESSIBILITY_UNSUPPORTED",
            "message": "macAccessibility runtime service is available on macOS only.",
            "details": {
                "platform": std::env::consts::OS,
            },
        },
    })
}

struct ProcessCapture {
    success: bool,
    exit_code: i64,
    output_text: String,
    stderr_text: String,
}

fn normalize_command_text(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw)
        .replace("\r\n", "\n")
        .trim()
        .to_string()
}

fn is_accessibility_permission_denied(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    normalized.contains("not allowed assistive access") || normalized.contains("assistive access")
}

fn run_process_capture(program: &str, args: &[impl AsRef<str>]) -> Result<ProcessCapture, String> {
    let mut command = Command::new(program);
    for arg in args {
        command.arg(arg.as_ref());
    }
    run_command_capture(&mut command)
}

fn run_command_capture(command: &mut Command) -> Result<ProcessCapture, String> {
    let result = command.output().map_err(|error| error.to_string())?;
    Ok(ProcessCapture {
        success: result.status.success(),
        exit_code: i64::from(result.status.code().unwrap_or(-1)),
        output_text: normalize_command_text(&result.stdout),
        stderr_text: normalize_command_text(&result.stderr),
    })
}

fn run_mac_accessibility_command(args: Vec<String>) -> Result<Value, String> {
    let result = run_process_capture("osascript", &args)?;
    if result.success {
        let mut object = Map::new();
        object.insert("ok".to_string(), Value::Bool(true));
        object.insert(std_out_key(), Value::String(result.output_text));
        if !result.stderr_text.is_empty() {
            object.insert("stderr".to_string(), Value::String(result.stderr_text));
        }
        return Ok(Value::Object(object));
    }

    let error_code = if is_accessibility_permission_denied(&result.stderr_text) {
        ACCESSIBILITY_PERMISSION_REQUIRED
    } else {
        "MAC_ACCESSIBILITY_EXECUTION_FAILED"
    };
    let error_message = if error_code == ACCESSIBILITY_PERMISSION_REQUIRED {
        "Presto needs macOS Accessibility permission. Open System Settings > Privacy & Security > Accessibility and enable Presto."
            .to_string()
    } else if !result.stderr_text.is_empty() {
        result.stderr_text.clone()
    } else if !result.output_text.is_empty() {
        result.output_text.clone()
    } else {
        "AppleScript execution failed.".to_string()
    };

    let mut object = Map::new();
    object.insert("ok".to_string(), Value::Bool(false));
    object.insert(std_out_key(), Value::String(result.output_text.clone()));
    if !result.stderr_text.is_empty() {
        object.insert(
            "stderr".to_string(),
            Value::String(result.stderr_text.clone()),
        );
    }
    object.insert(
        "error".to_string(),
        json!({
            "code": error_code,
            "message": error_message,
            "details": {
                "command": "osascript",
                "args": args,
            },
        }),
    );
    Ok(Value::Object(object))
}

fn unique_suffix() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0));
    format!("{}-{}", duration.as_millis(), std::process::id())
}

fn check_for_updates(_state: &Arc<RuntimeState>, request: Option<&Value>) -> Result<Value, String> {
    let current_version = request
        .and_then(|value| value.get("currentVersion"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let include_prerelease = request
        .and_then(|value| value.get("includePrerelease"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let repo = std::env::var("PRESTO_GITHUB_REPO").unwrap_or_else(|_| "LoyanLi/Presto".to_string());
    let url = format!("https://api.github.com/repos/{repo}/releases");
    let capture = run_process_capture(
        "curl",
        &[
            "-fsSL",
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "User-Agent: Presto-App",
            &url,
        ],
    )?;
    if !capture.success {
        return Err("github_release_fetch_failed".to_string());
    }
    let releases =
        serde_json::from_str::<Value>(&capture.output_text).map_err(|error| error.to_string())?;
    let release_array = releases.as_array().cloned().unwrap_or_default();

    let latest_release = select_latest_release(&release_array, include_prerelease);
    let has_update = latest_release
        .as_ref()
        .and_then(|release| release.get("tag_name").and_then(Value::as_str))
        .and_then(|latest_tag| compare_versions(latest_tag, &current_version))
        .map(|ordering| ordering > 0)
        .unwrap_or(false);

    Ok(json!({
        "currentVersion": current_version,
        "hasUpdate": has_update,
        "latestRelease": latest_release.map(|release| {
            json!({
                "repo": repo,
                "tagName": release.get("tag_name").cloned().unwrap_or(Value::Null),
                "name": release.get("name").cloned().unwrap_or(Value::Null),
                "htmlUrl": release.get("html_url").cloned().unwrap_or(Value::Null),
                "publishedAt": release.get("published_at").cloned().unwrap_or(Value::Null),
                "prerelease": release.get("prerelease").cloned().unwrap_or(Value::Bool(false)),
                "draft": release.get("draft").cloned().unwrap_or(Value::Bool(false)),
            })
        }),
    }))
}

#[cfg(test)]
mod tests {
    use super::{load_initial_backend_target_daw_from_contents, DEFAULT_DAW_TARGET};

    #[test]
    fn persisted_host_preferences_seed_initial_backend_target_daw() {
        let target = load_initial_backend_target_daw_from_contents(
            r#"{
                "hostPreferences": {
                    "dawTarget": "pro_tools"
                }
            }"#,
        );

        assert_eq!(target, "pro_tools");
    }

    #[test]
    fn invalid_or_unsupported_persisted_target_falls_back_to_default() {
        let invalid_target = load_initial_backend_target_daw_from_contents(
            r#"{
                "hostPreferences": {
                    "dawTarget": "logic"
                }
            }"#,
        );
        let invalid_json = load_initial_backend_target_daw_from_contents("not-json");

        assert_eq!(invalid_target, DEFAULT_DAW_TARGET);
        assert_eq!(invalid_json, DEFAULT_DAW_TARGET);
    }
}

fn select_latest_release(releases: &[Value], include_prerelease: bool) -> Option<Value> {
    let mut latest: Option<Value> = None;
    for release in releases {
        if release
            .get("draft")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        if !include_prerelease
            && release
                .get("prerelease")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        {
            continue;
        }
        let Some(tag_name) = release.get("tag_name").and_then(Value::as_str) else {
            continue;
        };
        if parse_version(tag_name).is_none() {
            continue;
        }
        match latest.as_ref() {
            None => latest = Some(release.clone()),
            Some(current_latest) => {
                let current_tag = current_latest
                    .get("tag_name")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if compare_versions(tag_name, current_tag).unwrap_or(0) > 0 {
                    latest = Some(release.clone());
                }
            }
        }
    }
    latest
}

fn normalize_version(raw: &str) -> String {
    raw.trim().trim_start_matches(['v', 'V']).to_string()
}

fn parse_version(raw: &str) -> Option<ParsedVersion> {
    let normalized = normalize_version(raw);
    let (core, prerelease) = normalized
        .split_once('-')
        .map(|(core, pre)| (core, Some(pre)))
        .unwrap_or_else(|| (normalized.as_str(), None));
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next()?.parse::<u64>().ok()?;
    let patch = parts.next()?.parse::<u64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let prerelease_parts = prerelease.map(|value| {
        value
            .split('.')
            .map(|part| {
                part.parse::<u64>()
                    .map(VersionPart::Number)
                    .unwrap_or_else(|_| VersionPart::Text(part.to_string()))
            })
            .collect::<Vec<_>>()
    });
    Some(ParsedVersion {
        major,
        minor,
        patch,
        prerelease: prerelease_parts,
    })
}

fn compare_versions(left_raw: &str, right_raw: &str) -> Option<i32> {
    let left = parse_version(left_raw)?;
    let right = parse_version(right_raw)?;
    if left.major != right.major {
        return Some(ordering_to_i32(left.major.cmp(&right.major)));
    }
    if left.minor != right.minor {
        return Some(ordering_to_i32(left.minor.cmp(&right.minor)));
    }
    if left.patch != right.patch {
        return Some(ordering_to_i32(left.patch.cmp(&right.patch)));
    }
    match (&left.prerelease, &right.prerelease) {
        (None, None) => Some(0),
        (None, Some(_)) => Some(1),
        (Some(_), None) => Some(-1),
        (Some(left_parts), Some(right_parts)) => {
            let max_length = left_parts.len().max(right_parts.len());
            for index in 0..max_length {
                let left_part = left_parts.get(index);
                let right_part = right_parts.get(index);
                match (left_part, right_part) {
                    (None, None) => return Some(0),
                    (None, Some(_)) => return Some(-1),
                    (Some(_), None) => return Some(1),
                    (
                        Some(VersionPart::Number(left_number)),
                        Some(VersionPart::Number(right_number)),
                    ) => {
                        if left_number != right_number {
                            return Some(if left_number > right_number { 1 } else { -1 });
                        }
                    }
                    (Some(VersionPart::Number(_)), Some(VersionPart::Text(_))) => return Some(-1),
                    (Some(VersionPart::Text(_)), Some(VersionPart::Number(_))) => return Some(1),
                    (Some(VersionPart::Text(left_text)), Some(VersionPart::Text(right_text))) => {
                        if left_text != right_text {
                            return Some(if left_text > right_text { 1 } else { -1 });
                        }
                    }
                }
            }
            Some(0)
        }
    }
}

fn ordering_to_i32(ordering: std::cmp::Ordering) -> i32 {
    match ordering {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
        std::cmp::Ordering::Greater => 1,
    }
}

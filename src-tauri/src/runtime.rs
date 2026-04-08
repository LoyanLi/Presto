use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{Shutdown, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
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
struct AutomationDefinitionRecord {
    id: String,
    title: String,
    app: String,
    description: Option<String>,
    script_path: PathBuf,
    input_keys: Vec<String>,
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
            target_daw: "pro_tools".to_string(),
        }),
        mobile_state: Mutex::new(MobileProgressState {
            origin: None,
            server_started: false,
            sessions: HashMap::new(),
        }),
    };

    let wrapped = Arc::new(state);
    sync_official_plugins(&wrapped)?;
    Arc::try_unwrap(wrapped).map_err(|_| "runtime_state_init_failed".to_string())
}

pub fn invoke(state: &Arc<RuntimeState>, operation: &str, args: Vec<Value>) -> Result<Value, String> {
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
        "dialog.folder.open" => open_folder_dialog(state),
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
                window.is_always_on_top().map_err(|error| error.to_string())?,
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
        "backend.status.get" => backend_status(state),
        "backend.capabilities.list" => backend_capabilities(state),
        "backend.lifecycle.restart" => {
            stop_backend(state)?;
            start_backend(state)?;
            wait_for_backend_ready(state)?;
            Ok(json!({ "ok": true }))
        }
        "backend.daw-adapter.snapshot.get" => load_daw_adapter_snapshot(state),
        "backend.daw-target.set" => {
            let next_target = args.first().and_then(Value::as_str).unwrap_or_default();
            set_backend_daw_target(state, next_target)
        }
        "backend.developer-mode.set" => {
            let enabled = args.first().and_then(Value::as_bool).unwrap_or(false);
            set_backend_developer_mode(state, enabled)
        }
        "backend.capability.invoke" => {
            let request = args.first().cloned().unwrap_or(Value::Null);
            invoke_backend_capability(state, request)
        }
        "plugins.catalog.list" => list_plugins(state),
        "plugins.install.directory" => {
            let overwrite = args.first().and_then(Value::as_bool).unwrap_or(false);
            match rfd::FileDialog::new().pick_folder() {
                Some(path) => install_plugin_from_directory(state, &path, overwrite),
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
                Some(path) => install_plugin_from_zip(state, &path, overwrite),
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
            install_plugin_from_directory(state, &PathBuf::from(selected), overwrite)
        }
        "plugins.install.zip.selected" => {
            let zip_path = args.first().and_then(Value::as_str).unwrap_or_default();
            let overwrite = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            install_plugin_from_zip(state, &PathBuf::from(zip_path), overwrite)
        }
        "plugins.set-enabled" => {
            let plugin_id = args.first().and_then(Value::as_str).unwrap_or_default();
            let enabled = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            set_plugin_enabled(state, plugin_id, enabled)
        }
        "plugins.uninstall" => {
            let plugin_id = args.first().and_then(Value::as_str).unwrap_or_default();
            uninstall_plugin(state, plugin_id)
        }
        "automation.definition.list" => list_automation_definitions(state),
        "automation.definition.run" => run_automation_definition(
            state,
            args.first().cloned().unwrap_or_else(|| Value::Object(Map::new())),
        ),
        "mobile-progress.session.create" => {
            let task_id = args.first().and_then(Value::as_str).unwrap_or_default();
            create_mobile_progress_session(state, task_id)
        }
        "mobile-progress.session.close" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            close_mobile_progress_session(state, session_id)
        }
        "mobile-progress.view-url.get" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            get_mobile_progress_view_url(state, session_id)
        }
        "mobile-progress.session.update" => {
            let session_id = args.first().and_then(Value::as_str).unwrap_or_default();
            let payload = args.get(1).cloned();
            update_mobile_progress_session(state, session_id, payload)
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
    Ok(crate::resolve_runtime_resources_dir(&state.app)?.join("plugins").join("official"))
}

fn automation_definitions_dir(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(crate::resolve_runtime_resources_dir(&state.app)?
        .join("frontend")
        .join("runtime")
        .join("automation")
        .join("definitions"))
}

fn automation_scripts_dir(state: &Arc<RuntimeState>) -> Result<PathBuf, String> {
    Ok(crate::resolve_runtime_resources_dir(&state.app)?
        .join("frontend")
        .join("runtime")
        .join("automation")
        .join("scripts"))
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

fn backend_snapshot(state: &Arc<RuntimeState>) -> Result<Value, String> {
    let mut backend = state
        .backend_state
        .lock()
        .map_err(|_| "backend_lock_failed".to_string())?;
    refresh_backend_child_state(&mut backend)?;
    Ok(json!({
        "running": backend.phase == "starting" || backend.phase == "running" || backend.phase == "stopping",
        "ready": backend.phase == "running",
        "pid": backend.pid,
        "port": backend.port,
        "status": backend.phase,
        "lastError": backend.last_error,
        "logsCount": backend.logs_count,
        "warnings": [],
    }))
}

fn backend_status(state: &Arc<RuntimeState>) -> Result<Value, String> {
    backend_snapshot(state)
}

fn refresh_backend_child_state(backend: &mut BackendSupervisorState) -> Result<(), String> {
    if let Some(child) = backend.child.as_mut() {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            backend.pid = None;
            backend.child = None;
            backend.phase = if status.success() {
                "stopped".to_string()
            } else {
                "error".to_string()
            };
        }
    }
    Ok(())
}

fn resolve_available_port(preferred_port: u16) -> Result<u16, String> {
    match TcpListener::bind(("127.0.0.1", preferred_port)) {
        Ok(listener) => {
            let port = listener
                .local_addr()
                .map_err(|error| error.to_string())?
                .port();
            drop(listener);
            Ok(port)
        }
        Err(_) => {
            let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
            let port = listener
                .local_addr()
                .map_err(|error| error.to_string())?
                .port();
            drop(listener);
            Ok(port)
        }
    }
}

fn start_backend(state: &Arc<RuntimeState>) -> Result<(), String> {
    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        refresh_backend_child_state(&mut backend)?;
        if backend.phase == "running" || backend.phase == "starting" {
            return Ok(());
        }
        backend.last_error = None;
        backend.phase = "starting".to_string();
        backend.logs_count += 1;
        backend.port = resolve_available_port(DEFAULT_PORT)?;
    }

    let (port, target_daw) = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        (backend.port, backend.target_daw.clone())
    };

    log_backend_message(
        state,
        "info",
        "backend_starting",
        Some(json!({
            "phase": "starting",
            "port": port,
        })),
    )?;

    let python_bin = resolve_backend_python_bin(state)?;
    let backend_working_dir = backend_root(state)?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "backend_working_dir_missing".to_string())?;

    let mut command = Command::new(&python_bin);
    command
        .arg("-m")
        .arg("presto.main_api")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(backend_working_dir)
        .env("PYTHONUNBUFFERED", "1")
        .env("PRESTO_TARGET_DAW", target_daw)
        .stderr(Stdio::piped());

    if let Some(python_home) = resolve_bundled_python_home(state)? {
        command.env("PYTHONHOME", python_home);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let pid = child.id();

    if let Some(pipe) = child.stderr.take() {
        let state_clone = Arc::clone(state);
        thread::spawn(move || {
            let reader = BufReader::new(pipe);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(mut backend) = state_clone.backend_state.lock() {
                    backend.logs_count += 1;
                    backend.last_error = Some(trimmed.to_string());
                }
                let _ = append_log(
                    &state_clone,
                    "error",
                    "backend.supervisor",
                    &format!("backend.stderr {trimmed}"),
                    Some(json!({ "port": pid })),
                );
            }
        });
    }

    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.pid = Some(pid);
        backend.child = Some(child);
    }

    match wait_for_backend_ready(state) {
        Ok(()) => {
            let mut backend = state
                .backend_state
                .lock()
                .map_err(|_| "backend_lock_failed".to_string())?;
            backend.phase = "running".to_string();
            backend.logs_count += 1;
            Ok(())
        }
        Err(error) => {
            let _ = stop_backend(state);
            let mut backend = state
                .backend_state
                .lock()
                .map_err(|_| "backend_lock_failed".to_string())?;
            backend.phase = "error".to_string();
            backend.last_error = Some(error.clone());
            backend.logs_count += 1;
            log_backend_message(
                state,
                "error",
                &format!("backend.start {error}"),
                Some(json!({ "port": port })),
            )?;
            Err(error)
        }
    }
}

fn stop_backend(state: &Arc<RuntimeState>) -> Result<(), String> {
    let port = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.port
    };

    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        refresh_backend_child_state(&mut backend)?;
        if backend.phase == "stopped" || backend.phase == "stopping" {
            return Ok(());
        }
        backend.phase = "stopping".to_string();
        backend.logs_count += 1;
        if let Some(child) = backend.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        backend.child = None;
        backend.pid = None;
        backend.phase = "stopped".to_string();
        backend.logs_count += 1;
    }

    log_backend_message(
        state,
        "info",
        "backend_process_exit",
        Some(json!({
            "code": 0,
            "phase": "stopped",
            "port": port,
        })),
    )?;
    Ok(())
}

fn wait_for_backend_ready(state: &Arc<RuntimeState>) -> Result<(), String> {
    let port = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.port
    };

    for _ in 0..30 {
        if http_json_request("GET", port, "/api/v1/health", None).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!("backend_not_ready_on_port_{port}"))
}

fn ensure_backend_available(state: &Arc<RuntimeState>) -> Result<(), String> {
    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        refresh_backend_child_state(&mut backend)?;
        if backend.child.is_none() || backend.phase == "stopped" || backend.phase == "error" {
            drop(backend);
            start_backend(state)?;
            return Ok(());
        }
    }

    let port = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.port
    };

    if http_json_request("GET", port, "/api/v1/health", None).is_ok() {
        return Ok(());
    }

    stop_backend(state)?;
    start_backend(state)
}

fn http_json_request(
    method: &str,
    port: u16,
    path: &str,
    body: Option<&Value>,
) -> Result<Value, String> {
    let mut stream =
        TcpStream::connect(("127.0.0.1", port)).map_err(|error| format!("backend_http_connect_failed:{error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;

    let payload = body.map(Value::to_string).unwrap_or_default();
    let has_body = body.is_some();
    let request = if has_body {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            payload.as_bytes().len(),
            payload
        )
    } else {
        format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
    };

    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("backend_http_write_failed:{error}"))?;
    let _ = stream.shutdown(Shutdown::Write);

    let mut response_bytes = Vec::new();
    stream
        .read_to_end(&mut response_bytes)
        .map_err(|error| format!("backend_http_read_failed:{error}"))?;
    let response_text = String::from_utf8_lossy(&response_bytes);
    let (head, body_text) = response_text
        .split_once("\r\n\r\n")
        .ok_or_else(|| "backend_http_invalid_response".to_string())?;
    let status_line = head.lines().next().unwrap_or_default();
    if !status_line.contains(" 200 ") {
        return Err(format!("backend_http_status_failed:{status_line}"));
    }

    if body_text.trim().is_empty() {
        return Ok(Value::Object(Map::new()));
    }

    serde_json::from_str(body_text).map_err(|error| format!("backend_http_json_failed:{error}"))
}

fn normalize_capability_definition(raw: &Value) -> Value {
    let field_support = raw
        .get("field_support")
        .and_then(Value::as_object)
        .map(|entries| {
            let mut mapped = Map::new();
            for (key, value) in entries {
                let request_fields = value
                    .get("request_fields")
                    .cloned()
                    .unwrap_or_else(|| Value::Array(Vec::new()));
                let response_fields = value
                    .get("response_fields")
                    .cloned()
                    .unwrap_or_else(|| Value::Array(Vec::new()));
                mapped.insert(
                    key.clone(),
                    json!({
                        "requestFields": request_fields,
                        "responseFields": response_fields,
                    }),
                );
            }
            Value::Object(mapped)
        })
        .unwrap_or_else(|| Value::Object(Map::new()));

    json!({
        "id": raw.get("id").cloned().unwrap_or(Value::Null),
        "version": raw.get("version").cloned().unwrap_or(Value::Null),
        "kind": raw.get("kind").cloned().unwrap_or(Value::Null),
        "domain": raw.get("domain").cloned().unwrap_or(Value::Null),
        "visibility": raw.get("visibility").cloned().unwrap_or(Value::Null),
        "description": raw.get("description").cloned().unwrap_or(Value::Null),
        "requestSchema": raw.get("request_schema").cloned().unwrap_or(Value::Null),
        "responseSchema": raw.get("response_schema").cloned().unwrap_or(Value::Null),
        "dependsOn": raw.get("depends_on").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "supportedDaws": raw.get("supported_daws").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "canonicalSource": raw.get("canonical_source").cloned().unwrap_or(Value::Null),
        "fieldSupport": field_support,
        "handler": raw.get("handler").cloned().unwrap_or(Value::Null),
        "emitsEvents": raw.get("emits_events").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
    })
}

fn backend_capabilities(state: &Arc<RuntimeState>) -> Result<Value, String> {
    ensure_backend_available(state)?;
    let port = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.port
    };
    let response = http_json_request("GET", port, "/api/v1/capabilities", None)?;
    let capabilities = response
        .get("capabilities")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|item| normalize_capability_definition(&item))
        .collect::<Vec<_>>();
    Ok(Value::Array(capabilities))
}

fn invoke_backend_capability(state: &Arc<RuntimeState>, request: Value) -> Result<Value, String> {
    ensure_backend_available(state)?;
    let port = {
        let backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.port
    };
    let enriched_request = enrich_capability_request(state, request)?;
    http_json_request(
        "POST",
        port,
        "/api/v1/capabilities/invoke",
        Some(&enriched_request),
    )
}

fn enrich_capability_request(state: &Arc<RuntimeState>, request: Value) -> Result<Value, String> {
    if request
        .get("capability")
        .and_then(Value::as_str)
        .unwrap_or_default()
        != "workflow.run.start"
    {
        return Ok(request);
    }

    let payload = request
        .get("payload")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let plugin_id = payload
        .get("pluginId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let workflow_id = payload
        .get("workflowId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let resolved = resolve_workflow_execution(state, plugin_id, workflow_id)?;

    let mut next_payload = payload;
    if let Some(definition) = resolved.get("definition") {
        next_payload.insert("definition".to_string(), definition.clone());
    }
    if let Some(allowed_capabilities) = resolved.get("allowedCapabilities") {
        next_payload.insert("allowedCapabilities".to_string(), allowed_capabilities.clone());
    }

    let mut next_request = request
        .as_object()
        .cloned()
        .ok_or_else(|| "invalid_capability_request".to_string())?;
    next_request.insert("payload".to_string(), Value::Object(next_payload));
    Ok(Value::Object(next_request))
}

fn runtime_meta(client_name: &str) -> Value {
    json!({
        "clientName": client_name,
        "clientVersion": state_version(),
        "sdkVersion": state_version(),
    })
}

fn state_version() -> &'static str {
    "0.3.3"
}

fn load_daw_adapter_snapshot(state: &Arc<RuntimeState>) -> Result<Value, String> {
    let request = json!({
        "requestId": format!("backend-daw-adapter-snapshot-{}", unique_suffix()),
        "capability": "daw.adapter.getSnapshot",
        "payload": {},
        "meta": runtime_meta("tauri-runtime"),
    });
    let response = invoke_backend_capability(state, request)?;
    extract_capability_data(response, "Failed to load DAW adapter snapshot.")
}

fn set_backend_developer_mode(state: &Arc<RuntimeState>, enabled: bool) -> Result<Value, String> {
    let request_suffix = unique_suffix();
    let get_config = invoke_backend_capability(
        state,
        json!({
            "requestId": format!("backend-set-developer-mode-get-{request_suffix}"),
            "capability": "config.get",
            "payload": {},
            "meta": runtime_meta("tauri-runtime"),
        }),
    )?;
    let current_config = extract_capability_data(get_config, "Failed to load config.")?
        .get("config")
        .cloned()
        .ok_or_else(|| "Invalid config payload.".to_string())?;

    let mut next_config = current_config
        .as_object()
        .cloned()
        .ok_or_else(|| "Invalid config payload.".to_string())?;
    let current_ui_preferences = next_config
        .get("uiPreferences")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut next_ui_preferences = current_ui_preferences;
    next_ui_preferences.insert(
        "developerModeEnabled".to_string(),
        Value::Bool(enabled),
    );
    next_config.insert(
        "uiPreferences".to_string(),
        Value::Object(next_ui_preferences),
    );

    invoke_backend_capability(
        state,
        json!({
            "requestId": format!("backend-set-developer-mode-update-{request_suffix}"),
            "capability": "config.update",
            "payload": {
                "config": next_config,
            },
            "meta": runtime_meta("tauri-runtime"),
        }),
    )?;

    Ok(json!({
        "ok": true,
        "enabled": enabled,
    }))
}

fn extract_capability_data(response: Value, fallback_message: &str) -> Result<Value, String> {
    if response
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        Ok(response.get("data").cloned().unwrap_or(Value::Null))
    } else {
        let message = response
            .get("error")
            .and_then(Value::as_object)
            .and_then(|error| {
                error
                    .get("message")
                    .and_then(Value::as_str)
                    .or_else(|| error.get("code").and_then(Value::as_str))
            })
            .unwrap_or(fallback_message);
        Err(message.to_string())
    }
}

fn set_backend_daw_target(state: &Arc<RuntimeState>, next_target: &str) -> Result<Value, String> {
    if next_target != "pro_tools" {
        return Err(format!(
            "unsupported_daw_target:{}",
            if next_target.is_empty() { "unknown" } else { next_target }
        ));
    }

    stop_backend(state)?;
    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.target_daw = next_target.to_string();
    }
    Ok(json!({
        "ok": true,
        "target": next_target,
    }))
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

fn open_folder_dialog(_state: &Arc<RuntimeState>) -> Result<Value, String> {
    Ok(match rfd::FileDialog::new().pick_folder() {
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

fn sync_official_plugins(state: &Arc<RuntimeState>) -> Result<(), String> {
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

fn required_string_array_field(map: &Map<String, Value>, field: &str) -> Result<Vec<String>, String> {
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

            match validate_plugin_manifest(&manifest_value, &plugin_root, &current_daw) {
                Ok(plugin) => plugins.push(plugin),
                Err(reason) => issues.push(create_issue(&reason, Some(&plugin_root), Some(&manifest_path))),
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

fn list_plugins(state: &Arc<RuntimeState>) -> Result<Value, String> {
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

fn install_plugin_from_directory(
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

    let plugin = plugins.first().cloned().ok_or_else(|| "plugin_not_found".to_string())?;
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

fn install_plugin_from_zip(
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

fn set_plugin_enabled(state: &Arc<RuntimeState>, plugin_id: &str, enabled: bool) -> Result<Value, String> {
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

fn uninstall_plugin(state: &Arc<RuntimeState>, plugin_id: &str) -> Result<Value, String> {
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

fn resolve_workflow_execution(
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
    let definition = serde_json::from_str::<Value>(&definition_text).map_err(|error| error.to_string())?;
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

fn list_automation_definitions(state: &Arc<RuntimeState>) -> Result<Value, String> {
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

fn run_automation_definition(state: &Arc<RuntimeState>, request: Value) -> Result<Value, String> {
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

    let preflight = mac_accessibility_preflight()?;
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
    let execution = run_mac_accessibility_file(
        &definition.script_path.to_string_lossy(),
        &args,
    )?;

    if !execution.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        let error = execution
            .get("error")
            .cloned()
            .unwrap_or_else(|| json!({ "code": "AUTOMATION_EXECUTION_FAILED", "message": "automation execution failed" }));
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

    let text = get_dynamic_key(&execution, &std_out_key())
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

fn std_out_key() -> String {
    ["std", "out"].concat()
}

fn get_dynamic_key<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    value.as_object().and_then(|map| map.get(key))
}

fn to_string_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items.iter()
                .map(|item| item.as_str().unwrap_or_default().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn mac_accessibility_preflight() -> Result<Value, String> {
    if cfg!(target_os = "macos") {
        let result = run_process_capture("osascript", &["-e", r#"tell application "System Events" to return UI elements enabled"#])?;
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
    let result = command.output().map_err(|error| error.to_string())?;
    Ok(ProcessCapture {
        success: result.status.success(),
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
        object.insert("stderr".to_string(), Value::String(result.stderr_text.clone()));
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

fn resolve_mobile_progress_host() -> String {
    for interface in ["en0", "en1", "en2", "en3"] {
        if let Ok(result) = run_process_capture("ipconfig", &["getifaddr", interface]) {
            if result.success && !result.output_text.is_empty() {
                return result.output_text;
            }
        }
    }
    "127.0.0.1".to_string()
}

fn ensure_mobile_server(state: &Arc<RuntimeState>) -> Result<String, String> {
    {
        let mobile = state
            .mobile_state
            .lock()
            .map_err(|_| "mobile_lock_failed".to_string())?;
        if let Some(origin) = &mobile.origin {
            return Ok(origin.clone());
        }
    }

    let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let origin = format!("http://{}:{port}", resolve_mobile_progress_host());

    {
        let mut mobile = state
            .mobile_state
            .lock()
            .map_err(|_| "mobile_lock_failed".to_string())?;
        if mobile.origin.is_some() {
            return Ok(mobile.origin.clone().unwrap_or_default());
        }
        mobile.origin = Some(origin.clone());
        mobile.server_started = true;
    }

    let state_clone = Arc::clone(state);
    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let state_for_stream = Arc::clone(&state_clone);
                    thread::spawn(move || {
                        let _ = handle_mobile_stream(&state_for_stream, stream);
                    });
                }
                Err(_) => break,
            }
        }
    });

    Ok(origin)
}

fn mobile_session_to_json(session: &MobileProgressSessionRecord) -> Value {
    json!({
        "sessionId": session.session_id,
        "token": session.token,
        "taskId": session.task_id,
        "createdAt": session.created_at,
        "updatedAt": session.updated_at,
        "active": session.active,
        "closedAt": session.closed_at,
    })
}

fn create_mobile_progress_session(state: &Arc<RuntimeState>, task_id: &str) -> Result<Value, String> {
    let normalized_task_id = task_id.trim();
    if normalized_task_id.is_empty() {
        return Ok(json!({
            "ok": false,
            "error": "Task ID is required.",
        }));
    }
    let origin = ensure_mobile_server(state)?;
    let session_id = format!("mob_{}", random_fragment(12));
    let token = format!("{}{}", random_fragment(16), random_fragment(16));
    let created_at = timestamp_now();

    {
        let mut mobile = state
            .mobile_state
            .lock()
            .map_err(|_| "mobile_lock_failed".to_string())?;
        mobile.sessions.insert(
            session_id.clone(),
            MobileProgressSessionRecord {
                session_id: session_id.clone(),
                token: token.clone(),
                task_id: normalized_task_id.to_string(),
                latest_job_view: None,
                created_at: created_at.clone(),
                updated_at: created_at.clone(),
                active: true,
                closed_at: None,
            },
        );
    }

    Ok(json!({
        "ok": true,
        "sessionId": session_id,
        "url": format!("{origin}/mobile-progress/{session_id}?token={token}"),
    }))
}

fn close_mobile_progress_session(state: &Arc<RuntimeState>, session_id: &str) -> Result<Value, String> {
    let normalized_session_id = session_id.trim();
    if normalized_session_id.is_empty() {
        return Ok(json!({ "ok": false }));
    }
    let mut mobile = state
        .mobile_state
        .lock()
        .map_err(|_| "mobile_lock_failed".to_string())?;
    let Some(session) = mobile.sessions.get_mut(normalized_session_id) else {
        return Ok(json!({ "ok": false }));
    };
    if !session.active {
        return Ok(json!({ "ok": false }));
    }
    let closed_at = timestamp_now();
    session.active = false;
    session.closed_at = Some(closed_at.clone());
    session.updated_at = closed_at;
    Ok(json!({ "ok": true }))
}

fn get_mobile_progress_view_url(state: &Arc<RuntimeState>, session_id: &str) -> Result<Value, String> {
    let normalized_session_id = session_id.trim();
    if normalized_session_id.is_empty() {
        return Ok(json!({
            "ok": false,
            "error": "Session ID is required.",
        }));
    }
    let origin = ensure_mobile_server(state)?;
    let mobile = state
        .mobile_state
        .lock()
        .map_err(|_| "mobile_lock_failed".to_string())?;
    let Some(session) = mobile.sessions.get(normalized_session_id) else {
        return Ok(json!({
            "ok": false,
            "error": "Session is not active.",
        }));
    };
    if !session.active {
        return Ok(json!({
            "ok": false,
            "error": "Session is not active.",
        }));
    }
    Ok(json!({
        "ok": true,
        "sessionId": session.session_id,
        "url": format!("{origin}/mobile-progress/{}?token={}", session.session_id, session.token),
    }))
}

fn update_mobile_progress_session(
    state: &Arc<RuntimeState>,
    session_id: &str,
    payload: Option<Value>,
) -> Result<Value, String> {
    let normalized_session_id = session_id.trim();
    if normalized_session_id.is_empty() {
        return Ok(json!({
            "ok": false,
            "error": "Session ID is required.",
        }));
    }
    let mut mobile = state
        .mobile_state
        .lock()
        .map_err(|_| "mobile_lock_failed".to_string())?;
    let Some(session) = mobile.sessions.get_mut(normalized_session_id) else {
        return Ok(json!({
            "ok": false,
            "error": "Session is not active.",
        }));
    };
    if !session.active {
        return Ok(json!({
            "ok": false,
            "error": "Session is not active.",
        }));
    }
    let updated_at = timestamp_now();
    session.latest_job_view = payload.filter(|value| value.is_object());
    session.updated_at = updated_at.clone();
    Ok(json!({
        "ok": true,
        "sessionId": normalized_session_id,
        "updatedAt": updated_at,
    }))
}

fn random_fragment(length: usize) -> String {
    let alphabet = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_nanos() as u64;
    let mut output = String::with_capacity(length);
    for _ in 0..length {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let index = (seed % alphabet.len() as u64) as usize;
        output.push(alphabet[index] as char);
    }
    output
}

fn build_mobile_progress_page(session_id: &str, token: &str) -> String {
    let api_url = format!("/mobile-progress-api/{session_id}?token={token}");
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>Presto Export Progress</title>
    <style>
      body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; background: #f4f3ef; color: #181a20; }}
      main {{ max-width: 42rem; margin: 0 auto; padding: 24px 16px 40px; }}
      .card {{ background: #fff; border: 1px solid rgba(24,26,32,.08); border-radius: 18px; padding: 16px; margin-top: 12px; }}
      .pill {{ display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(182,92,45,.14); color: #b65c2d; font-weight: 600; }}
      .grid {{ display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }}
      .metric {{ padding: 12px; border-radius: 14px; background: #f1ede5; }}
      .metric label {{ display: block; color: #676c78; font-size: .78rem; margin-bottom: 6px; }}
      .metric strong {{ display: block; font-size: .95rem; }}
      .bar {{ margin-top: 14px; height: 10px; border-radius: 999px; background: rgba(24,26,32,.08); overflow: hidden; }}
      .bar > div {{ height: 100%; width: 0%; background: linear-gradient(90deg, #c9743a 0%, #b65c2d 100%); }}
      .muted {{ color: #676c78; }}
      ul {{ margin: 12px 0 0; padding-left: 18px; }}
      @media (max-width: 520px) {{ .grid {{ grid-template-columns: 1fr; }} }}
    </style>
  </head>
  <body>
    <main>
      <h1>Presto Export Progress</h1>
      <p class="muted">Live export status from your current desktop session.</p>
      <section class="card">
        <div id="status" class="pill">Connecting…</div>
        <div class="bar"><div id="progress"></div></div>
        <p id="message" class="muted">Waiting for export updates…</p>
      </section>
      <section class="card">
        <div class="grid">
          <div class="metric"><label>Task ID</label><strong id="task-id">-</strong></div>
          <div class="metric"><label>Progress</label><strong id="progress-text">0%</strong></div>
          <div class="metric"><label>Current</label><strong id="current-text">0 / 0</strong></div>
        </div>
      </section>
      <section class="card">
        <h2 style="margin:0;font-size:1rem;">Recent files</h2>
        <ul id="files"><li class="muted">No exported files yet.</li></ul>
      </section>
      <section class="card">
        <h2 style="margin:0;font-size:1rem;">Errors</h2>
        <ul id="errors"><li class="muted">No errors.</li></ul>
      </section>
    </main>
    <script>
      const apiUrl = {api_url:?};
      function renderList(id, items, emptyText) {{
        const element = document.getElementById(id);
        if (!Array.isArray(items) || items.length === 0) {{
          element.innerHTML = '<li class="muted">' + emptyText + '</li>';
          return;
        }}
        element.innerHTML = items.map((item) => '<li>' + String(item) + '</li>').join('');
      }}
      function render(data) {{
        const session = data.session || {{}};
        const job = data.jobView || {{}};
        const percent = Math.max(0, Math.min(100, Number(job.progressPercent || 0)));
        document.getElementById('status').textContent = String(job.terminalStatus || job.state || 'pending');
        document.getElementById('progress').style.width = percent + '%';
        document.getElementById('message').textContent = String(job.message || 'Waiting for export updates…');
        document.getElementById('task-id').textContent = String(job.jobId || session.taskId || '-');
        document.getElementById('progress-text').textContent = Math.round(percent) + '%';
        document.getElementById('current-text').textContent = String(Number(job.currentSnapshot || 0)) + ' / ' + String(Number(job.totalSnapshots || 0));
        renderList('files', Array.isArray(job.exportedFiles) ? job.exportedFiles : [], 'No exported files yet.');
        renderList('errors', Array.isArray(job.failedSnapshots) ? job.failedSnapshots : [], 'No errors.');
      }}
      async function refresh() {{
        try {{
          const response = await fetch(apiUrl, {{ cache: 'no-store' }});
          const data = await response.json();
          if (!response.ok || !data.ok) {{
            throw new Error(data.error || 'Failed to load progress.');
          }}
          render(data);
        }} catch (error) {{
          document.getElementById('status').textContent = 'offline';
          document.getElementById('message').textContent = error instanceof Error ? error.message : String(error);
        }}
      }}
      refresh();
      window.setInterval(refresh, 1000);
    </script>
  </body>
</html>"#
    )
}

fn handle_mobile_stream(state: &Arc<RuntimeState>, mut stream: TcpStream) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    let mut buffer = [0_u8; 8_192];
    let read_count = stream.read(&mut buffer).map_err(|error| error.to_string())?;
    if read_count == 0 {
        return Ok(());
    }
    let request_text = String::from_utf8_lossy(&buffer[..read_count]).to_string();
    let request_line = request_text.lines().next().unwrap_or_default().to_string();
    let request_path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .to_string();
    let (path_only, query) = request_path
        .split_once('?')
        .map(|(path, query)| (path.to_string(), query.to_string()))
        .unwrap_or_else(|| (request_path.clone(), String::new()));

    let token = query
        .split('&')
        .find_map(|entry| entry.split_once('=').and_then(|(key, value)| (key == "token").then_some(value)))
        .unwrap_or_default()
        .to_string();

    if let Some(session_id) = path_only.strip_prefix("/mobile-progress/") {
        let session = {
            let mobile = state
                .mobile_state
                .lock()
                .map_err(|_| "mobile_lock_failed".to_string())?;
            mobile.sessions.get(session_id).cloned()
        };
        let Some(session) = session else {
            write_http_response(&mut stream, 403, "text/html; charset=utf-8", "<h1>Session not found.</h1>")?;
            return Ok(());
        };
        if token != session.token {
            write_http_response(&mut stream, 403, "text/html; charset=utf-8", "<h1>Session not found.</h1>")?;
            return Ok(());
        }
        write_http_response(
            &mut stream,
            200,
            "text/html; charset=utf-8",
            &build_mobile_progress_page(&session.session_id, &session.token),
        )?;
        return Ok(());
    }

    if let Some(session_id) = path_only.strip_prefix("/mobile-progress-api/") {
        let session = {
            let mobile = state
                .mobile_state
                .lock()
                .map_err(|_| "mobile_lock_failed".to_string())?;
            mobile.sessions.get(session_id).cloned()
        };
        let Some(session) = session else {
            write_http_response(
                &mut stream,
                403,
                "application/json; charset=utf-8",
                &json!({ "ok": false, "error": "Session not found." }).to_string(),
            )?;
            return Ok(());
        };
        if token != session.token {
            write_http_response(
                &mut stream,
                403,
                "application/json; charset=utf-8",
                &json!({ "ok": false, "error": "Session not found." }).to_string(),
            )?;
            return Ok(());
        }

        let job_view = match session.latest_job_view.clone() {
            Some(value) => value,
            None => load_mobile_progress_job_view(state, &session.task_id)?,
        };
        write_http_response(
            &mut stream,
            200,
            "application/json; charset=utf-8",
            &json!({
                "ok": true,
                "session": mobile_session_to_json(&session),
                "jobView": job_view,
            })
            .to_string(),
        )?;
        return Ok(());
    }

    write_http_response(&mut stream, 404, "text/html; charset=utf-8", "<h1>Not Found</h1>")
}

fn write_http_response(
    stream: &mut TcpStream,
    status_code: u16,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    let status_text = match status_code {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\nContent-Type: {content_type}\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())
}

fn load_mobile_progress_job_view(state: &Arc<RuntimeState>, task_id: &str) -> Result<Value, String> {
    let response = invoke_backend_capability(
        state,
        json!({
            "requestId": format!("mobile-progress-{}", unique_suffix()),
            "capability": "jobs.get",
            "payload": {
                "jobId": task_id,
            },
            "meta": runtime_meta("mobile-progress"),
        }),
    )?;
    let job = extract_capability_data(response, "Failed to load progress.")?;
    Ok(derive_mobile_progress_job_view(&job))
}

fn derive_mobile_progress_job_view(job: &Value) -> Value {
    let progress = job.get("progress").and_then(Value::as_object).cloned().unwrap_or_default();
    let metadata = job.get("metadata").and_then(Value::as_object).cloned().unwrap_or_default();
    let result = job.get("result").and_then(Value::as_object).cloned().unwrap_or_default();
    let state = job.get("state").and_then(Value::as_str).unwrap_or("queued");
    let terminal_status = result
        .get("status")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            if state == "succeeded" {
                "completed".to_string()
            } else {
                state.to_string()
            }
        });

    json!({
        "jobId": job.get("jobId").cloned().unwrap_or_else(|| Value::String(String::new())),
        "state": state,
        "terminalStatus": terminal_status,
        "progressPercent": number_value(metadata.get("percent").or_else(|| progress.get("percent"))),
        "message": string_value(progress.get("message")),
        "currentSnapshot": number_value(metadata.get("currentSnapshot").or_else(|| progress.get("current"))),
        "totalSnapshots": number_value(metadata.get("totalSnapshots").or_else(|| progress.get("total"))),
        "currentSnapshotName": string_value(metadata.get("currentSnapshotName")),
        "etaSeconds": metadata.get("etaSeconds").cloned().unwrap_or(Value::Null),
        "exportedCount": number_value(metadata.get("exportedCount")).max(
            result
                .get("exportedFiles")
                .and_then(Value::as_array)
                .map(|items| items.len() as f64)
                .unwrap_or(0.0)
        ),
        "exportedFiles": result.get("exportedFiles").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "failedSnapshots": result.get("failedSnapshots").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "failedSnapshotDetails": result.get("failedSnapshotDetails").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "isTerminal": matches!(state, "succeeded" | "failed" | "cancelled"),
    })
}

fn string_value(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn number_value(value: Option<&Value>) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(0.0)
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
    let releases = serde_json::from_str::<Value>(&capture.output_text).map_err(|error| error.to_string())?;
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

fn select_latest_release(releases: &[Value], include_prerelease: bool) -> Option<Value> {
    let mut latest: Option<Value> = None;
    for release in releases {
        if release.get("draft").and_then(Value::as_bool).unwrap_or(false) {
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
                    (Some(VersionPart::Number(left_number)), Some(VersionPart::Number(right_number))) => {
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

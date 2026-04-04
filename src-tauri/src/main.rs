use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Deserialize)]
struct SidecarResponse {
    id: String,
    ok: bool,
    result: Option<Value>,
    error: Option<SidecarError>,
}

#[derive(Debug, Deserialize)]
struct SidecarError {
    message: String,
}

struct SidecarProcess {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

enum SidecarCallError {
    Recoverable(String),
    Fatal(String),
}

struct SidecarState {
    app: AppHandle,
    process: Mutex<SidecarProcess>,
    next_id: Mutex<u64>,
}

fn recoverable_sidecar_error(message: impl Into<String>) -> SidecarCallError {
    SidecarCallError::Recoverable(message.into())
}

fn execute_sidecar_call(
    process: &mut SidecarProcess,
    request_id: &str,
    operation: &str,
    args: &[Value],
) -> Result<Value, SidecarCallError> {
    let payload = json!({
        "id": request_id,
        "operation": operation,
        "args": args,
    });

    writeln!(process.stdin, "{}", payload)
        .map_err(|error| recoverable_sidecar_error(format!("sidecar_stdin_write_failed:{error}")))?;
    process
        .stdin
        .flush()
        .map_err(|error| recoverable_sidecar_error(format!("sidecar_stdin_flush_failed:{error}")))?;

    let mut line = String::new();
    process
        .stdout
        .read_line(&mut line)
        .map_err(|error| recoverable_sidecar_error(format!("sidecar_stdout_read_failed:{error}")))?;
    if line.trim().is_empty() {
        return Err(recoverable_sidecar_error("sidecar_stdout_eof"));
    }

    let response: SidecarResponse = serde_json::from_str(&line)
        .map_err(|error| recoverable_sidecar_error(format!("sidecar_invalid_response:{error}")))?;
    if response.id != request_id {
        return Err(recoverable_sidecar_error("sidecar_response_id_mismatch"));
    }
    if response.ok {
        Ok(response.result.unwrap_or(Value::Null))
    } else {
        Err(SidecarCallError::Fatal(
            response
                .error
                .map(|error| error.message)
                .unwrap_or_else(|| "sidecar_request_failed".to_string()),
        ))
    }
}

impl SidecarState {
    fn call(&self, operation: &str, args: Vec<Value>) -> Result<Value, String> {
        let mut id_guard = self.next_id.lock().map_err(|_| "sidecar_id_lock_failed".to_string())?;
        *id_guard += 1;
        let request_id = format!("req-{}", *id_guard);
        drop(id_guard);

        let mut process = self.process.lock().map_err(|_| "sidecar_lock_failed".to_string())?;
        match execute_sidecar_call(&mut process, &request_id, operation, &args) {
            Ok(result) => Ok(result),
            Err(SidecarCallError::Fatal(message)) => Err(message),
            Err(SidecarCallError::Recoverable(message)) => {
                *process = spawn_sidecar(&self.app)?;
                execute_sidecar_call(&mut process, &request_id, operation, &args).map_err(|retry_error| {
                    let retry_message = match retry_error {
                        SidecarCallError::Recoverable(detail) | SidecarCallError::Fatal(detail) => detail,
                    };
                    format!("retry_after_sidecar_respawn:{message}:{retry_message}")
                })
            }
        }
    }
}

fn build_sidecar_env(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    let mut env = HashMap::new();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let resources_dir = resolve_runtime_resources_dir(app)?;
    env.insert(
        "PRESTO_APP_DATA_DIR".to_string(),
        app_data_dir.to_string_lossy().to_string(),
    );
    env.insert(
        "PRESTO_RESOURCES_DIR".to_string(),
        resources_dir.to_string_lossy().to_string(),
    );
    Ok(env)
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf()
}

fn resolve_runtime_resources_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(repo_root());
    }

    let bundled_resources_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let bundled_sidecar_entry = bundled_resources_dir
        .join("build")
        .join("sidecar")
        .join("main.mjs");

    if bundled_sidecar_entry.exists() {
        Ok(bundled_resources_dir)
    } else {
        Ok(repo_root())
    }
}

fn resolve_sidecar_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let resources_dir = resolve_runtime_resources_dir(app)?;
    Ok((
        resources_dir.join("build").join("sidecar").join("node"),
        resources_dir.join("build").join("sidecar").join("main.mjs"),
    ))
}

fn spawn_sidecar(app: &AppHandle) -> Result<SidecarProcess, String> {
    let (node_binary, sidecar_entry) = resolve_sidecar_paths(app)?;
    if !node_binary.exists() {
        return Err(format!("sidecar_node_missing:{}", node_binary.display()));
    }
    if !sidecar_entry.exists() {
        return Err(format!("sidecar_entry_missing:{}", sidecar_entry.display()));
    }
    let mut command = Command::new(&node_binary);
    command.arg(&sidecar_entry);
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::inherit());

    for (key, value) in build_sidecar_env(app)? {
        command.env(key, value);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdin = child.stdin.take().ok_or_else(|| "sidecar_missing_stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "sidecar_missing_stdout".to_string())?;

    Ok(SidecarProcess {
        _child: child,
        stdin,
        stdout: BufReader::new(stdout),
    })
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

fn open_external(url: &str) -> Result<Value, String> {
    let status = Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(Value::Bool(true))
    } else {
        Err("open_external_failed".to_string())
    }
}

fn json_bool(value: bool) -> Value {
    Value::Bool(value)
}

#[tauri::command]
fn app_ready(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("splashscreen") {
        let _ = window.close();
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "missing_main_window".to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn runtime_invoke(
    app: AppHandle,
    state: State<'_, Arc<SidecarState>>,
    operation: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    match operation.as_str() {
        "app.version.get" => Ok(Value::String(app.package_info().version.to_string())),
        "app.log.view" => {
            let payload = state.call("app.log.current-path.get", vec![])?;
            let file_path = payload
                .get("filePath")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "missing_log_path".to_string())?;
            open_log_in_console(file_path)?;
            Ok(json!({ "ok": true, "filePath": file_path }))
        }
        "dialog.folder.open" => {
            let selected = rfd::FileDialog::new().pick_folder();
            if let Some(path) = selected {
                Ok(json!({
                    "canceled": false,
                    "filePaths": [path.to_string_lossy().to_string()],
                }))
            } else {
                Ok(json!({
                    "canceled": true,
                    "filePaths": [],
                }))
            }
        }
        "shell.path.open" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            open_with_system(target)
        }
        "shell.external.open" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            open_external(target)
        }
        "fs.file.read" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            match fs::read_to_string(target) {
                Ok(content) => Ok(Value::String(content)),
                Err(_) => Ok(Value::Null),
            }
        }
        "fs.file.write" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            let content = args.get(1).and_then(|value| value.as_str()).unwrap_or_default();
            fs::write(target, content).map_err(|error| error.to_string())?;
            Ok(json_bool(true))
        }
        "fs.dir.ensure" | "fs.dir.create" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            fs::create_dir_all(target).map_err(|error| error.to_string())?;
            Ok(json_bool(true))
        }
        "fs.home-path.get" => {
            let home = std::env::var("HOME").map_err(|error| error.to_string())?;
            Ok(Value::String(home))
        }
        "fs.path.exists" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            Ok(json_bool(PathBuf::from(target).exists()))
        }
        "fs.path.stat" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            match fs::metadata(target) {
                Ok(metadata) => Ok(json!({
                    "isFile": metadata.is_file(),
                    "isDirectory": metadata.is_dir(),
                })),
                Err(_) => Ok(Value::Null),
            }
        }
        "fs.dir.read" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            let entries = fs::read_dir(target)
                .map_err(|error| error.to_string())?
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect::<Vec<_>>();
            Ok(json!(entries))
        }
        "fs.file.unlink" | "fs.file.delete" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            fs::remove_file(target).map_err(|error| error.to_string())?;
            Ok(json_bool(true))
        }
        "fs.dir.remove" => {
            let target = args.get(0).and_then(|value| value.as_str()).unwrap_or_default();
            fs::remove_dir_all(target).map_err(|error| error.to_string())?;
            Ok(json_bool(true))
        }
        "window.always-on-top.get" => {
            let window = app.get_webview_window("main").ok_or_else(|| "missing_main_window".to_string())?;
            Ok(Value::Bool(window.is_always_on_top().map_err(|error| error.to_string())?))
        }
        "window.always-on-top.set" => {
            let window = app.get_webview_window("main").ok_or_else(|| "missing_main_window".to_string())?;
            let enabled = args.get(0).and_then(|value| value.as_bool()).unwrap_or(false);
            window
                .set_always_on_top(enabled)
                .map_err(|error| error.to_string())?;
            Ok(Value::Bool(enabled))
        }
        "window.always-on-top.toggle" => {
            let window = app.get_webview_window("main").ok_or_else(|| "missing_main_window".to_string())?;
            let current = window.is_always_on_top().map_err(|error| error.to_string())?;
            let next = !current;
            window
                .set_always_on_top(next)
                .map_err(|error| error.to_string())?;
            Ok(Value::Bool(next))
        }
        "plugins.install.directory" => {
            let overwrite = args.get(0).and_then(|value| value.as_bool()).unwrap_or(false);
            if let Some(path) = rfd::FileDialog::new().pick_folder() {
                state.call(
                    "plugins.install.directory.selected",
                    vec![Value::String(path.to_string_lossy().to_string()), Value::Bool(overwrite)],
                )
            } else {
                Ok(json!({
                    "ok": false,
                    "cancelled": true,
                    "managedPluginsRoot": app.path().app_data_dir().map_err(|error| error.to_string())?.join("extensions").to_string_lossy().to_string(),
                    "issues": [],
                }))
            }
        }
        "plugins.install.zip" => {
            let overwrite = args.get(0).and_then(|value| value.as_bool()).unwrap_or(false);
            if let Some(path) = rfd::FileDialog::new().add_filter("Plugin Zip", &["zip"]).pick_file() {
                state.call(
                    "plugins.install.zip.selected",
                    vec![Value::String(path.to_string_lossy().to_string()), Value::Bool(overwrite)],
                )
            } else {
                Ok(json!({
                    "ok": false,
                    "cancelled": true,
                    "managedPluginsRoot": app.path().app_data_dir().map_err(|error| error.to_string())?.join("extensions").to_string_lossy().to_string(),
                    "issues": [],
                }))
            }
        }
        "app.release.latest.get"
        | "backend.status.get"
        | "backend.daw-adapter.snapshot.get"
        | "backend.lifecycle.restart"
        | "backend.daw-target.set"
        | "backend.developer-mode.set"
        | "backend.capability.invoke"
        | "automation.definition.list"
        | "automation.definition.run"
        | "mobile-progress.session.create"
        | "mobile-progress.session.close"
        | "mobile-progress.view-url.get"
        | "mobile-progress.session.update"
        | "mac-accessibility.preflight"
        | "mac-accessibility.script.run"
        | "mac-accessibility.file.run"
        | "plugins.catalog.list"
        | "plugins.set-enabled"
        | "plugins.uninstall" => state.call(&operation, args),
        _ => Err(format!("unsupported_operation:{operation}")),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let process = spawn_sidecar(&app.handle())?;
            app.manage(Arc::new(SidecarState {
                app: app.handle().clone(),
                process: Mutex::new(process),
                next_id: Mutex::new(0),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_ready, runtime_invoke])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

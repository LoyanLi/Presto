use serde_json::{json, Map, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::Duration,
};

use super::{
    append_log, app_data_dir, backend_root, log_backend_message, resolve_backend_python_bin,
    resolve_bundled_python_home, unique_suffix, BackendSupervisorState, RuntimeState, DEFAULT_PORT,
    SUPPORTED_DAW_TARGETS,
};

pub(super) fn backend_status(state: &Arc<RuntimeState>) -> Result<Value, String> {
    backend_snapshot(state)
}

pub(super) fn backend_capabilities(state: &Arc<RuntimeState>) -> Result<Value, String> {
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

pub(super) fn restart_backend(state: &Arc<RuntimeState>) -> Result<Value, String> {
    stop_backend(state, "backend_lifecycle_restart")?;
    start_backend(state)?;
    wait_for_backend_ready(state)?;
    Ok(json!({ "ok": true }))
}

pub(super) fn load_daw_adapter_snapshot(state: &Arc<RuntimeState>) -> Result<Value, String> {
    let request = json!({
        "requestId": format!("backend-daw-adapter-snapshot-{}", unique_suffix()),
        "capability": "daw.adapter.getSnapshot",
        "payload": {},
        "meta": runtime_meta("tauri-runtime"),
    });
    let response = invoke_backend_capability(state, request)?;
    extract_capability_data(response, "Failed to load DAW adapter snapshot.")
}

pub(super) fn set_backend_daw_target(
    state: &Arc<RuntimeState>,
    next_target: &str,
) -> Result<Value, String> {
    if !SUPPORTED_DAW_TARGETS.contains(&next_target) {
        return Err(format!(
            "unsupported_daw_target:{}",
            if next_target.is_empty() {
                "unknown"
            } else {
                next_target
            }
        ));
    }

    stop_backend(state, "backend_daw_target_set")?;
    {
        let mut backend = state
            .backend_state
            .lock()
            .map_err(|_| "backend_lock_failed".to_string())?;
        backend.target_daw = next_target.to_string();
    }
    start_backend(state)?;
    wait_for_backend_ready(state)?;
    Ok(json!({
        "ok": true,
        "target": next_target,
    }))
}

pub(super) fn set_backend_developer_mode(
    state: &Arc<RuntimeState>,
    enabled: bool,
) -> Result<Value, String> {
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
    next_ui_preferences.insert("developerModeEnabled".to_string(), Value::Bool(enabled));
    next_config.insert("uiPreferences".to_string(), Value::Object(next_ui_preferences));

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

pub(super) fn invoke_backend_capability(
    state: &Arc<RuntimeState>,
    request: Value,
) -> Result<Value, String> {
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

pub(super) fn extract_capability_data(
    response: Value,
    fallback_message: &str,
) -> Result<Value, String> {
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

pub(super) fn runtime_meta(client_name: &str) -> Value {
    json!({
        "clientName": client_name,
        "clientVersion": state_version(),
        "sdkVersion": state_version(),
    })
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
            let listener =
                TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
            let port = listener
                .local_addr()
                .map_err(|error| error.to_string())?
                .port();
            drop(listener);
            Ok(port)
        }
    }
}

fn backend_env_vars(
    runtime_app_data_dir: &Path,
    target_daw: &str,
    python_home: Option<&Path>,
) -> Vec<(&'static str, String)> {
    let mut env_vars = vec![
        ("PYTHONUNBUFFERED", "1".to_string()),
        ("PRESTO_TARGET_DAW", target_daw.to_string()),
        (
            "PRESTO_APP_DATA_DIR",
            runtime_app_data_dir.to_string_lossy().to_string(),
        ),
    ];
    if let Some(home) = python_home {
        env_vars.push(("PYTHONHOME", home.to_string_lossy().to_string()));
    }
    env_vars
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
    let python_home = resolve_bundled_python_home(state)?;
    let runtime_app_data_dir = app_data_dir(state)?;

    let mut command = Command::new(&python_bin);
    command
        .arg("-m")
        .arg("presto.main_api")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(backend_working_dir)
        .stderr(Stdio::piped());
    for (key, value) in backend_env_vars(
        &runtime_app_data_dir,
        &target_daw,
        python_home.as_deref(),
    ) {
        command.env(key, value);
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
            let _ = stop_backend(state, "backend_start_failure_cleanup");
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

fn stop_backend(state: &Arc<RuntimeState>, reason: &str) -> Result<(), String> {
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
            "reason": reason,
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

    stop_backend(state, "backend_healthcheck_restart")?;
    start_backend(state)
}

fn http_json_request(
    method: &str,
    port: u16,
    path: &str,
    body: Option<&Value>,
) -> Result<Value, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|error| format!("backend_http_connect_failed:{error}"))?;
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
    let resolved = super::plugins::resolve_workflow_execution(state, plugin_id, workflow_id)?;

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

fn state_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::backend_env_vars;
    use std::path::Path;

    #[test]
    fn backend_env_vars_always_include_runtime_app_data_dir() {
        let env_vars = backend_env_vars(Path::new("/tmp/presto-app-data"), "pro_tools", None);
        assert!(env_vars.iter().any(|(key, value)| {
            *key == "PRESTO_APP_DATA_DIR" && value == "/tmp/presto-app-data"
        }));
    }

    #[test]
    fn backend_env_vars_include_python_home_when_present() {
        let env_vars = backend_env_vars(
            Path::new("/tmp/presto-app-data"),
            "pro_tools",
            Some(Path::new("/tmp/python-home")),
        );
        assert!(env_vars
            .iter()
            .any(|(key, value)| *key == "PYTHONHOME" && value == "/tmp/python-home"));
    }
}

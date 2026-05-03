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
    app_data_dir, append_execution_log_from_raw_line, append_log, backend_root,
    log_backend_message, resolve_backend_python_bin, resolve_bundled_python_home, unique_suffix,
    RuntimeState, DEFAULT_DAW_TARGET, DEFAULT_PORT, EXECUTION_LOG_PREFIX, SUPPORTED_DAW_TARGETS,
};

struct HttpJsonResponse {
    status_code: u16,
    status_line: String,
    body: Value,
}

pub(super) struct BackendSupervisorState {
    pub(super) phase: String,
    pub(super) last_error: Option<String>,
    pub(super) logs_count: u64,
    pub(super) port: u16,
    pub(super) pid: Option<u32>,
    pub(super) child: Option<std::process::Child>,
    pub(super) target_daw: String,
}

impl BackendSupervisorState {
    pub(super) fn new(port: u16, target_daw: String) -> Self {
        Self {
            phase: "stopped".to_string(),
            last_error: None,
            logs_count: 0,
            port,
            pid: None,
            child: None,
            target_daw,
        }
    }
}

fn strip_ansi_escape_sequences(input: &str) -> String {
    let mut normalized = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                chars.next();
                for next in chars.by_ref() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            continue;
        }
        normalized.push(ch);
    }
    normalized
}

fn classify_backend_stderr_line(line: &str) -> (&'static str, String) {
    let normalized = strip_ansi_escape_sequences(line).trim().to_string();
    let level = if normalized.starts_with("INFO:") {
        "info"
    } else if normalized.starts_with("WARNING:") || normalized.starts_with("WARN:") {
        "warn"
    } else {
        "error"
    };
    (level, format!("backend.stderr {normalized}"))
}

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
    let response = http_json_request_ok("GET", port, "/api/v1/capabilities", None)?;
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

    persist_backend_target_daw_preference(state, next_target)?;
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

fn persist_backend_target_daw_preference(
    state: &Arc<RuntimeState>,
    next_target: &str,
) -> Result<(), String> {
    let config_path = app_data_dir(state)?.join("config.json");
    let current_config = read_runtime_config(&config_path)?;
    let next_config = update_backend_target_daw_preference_config(current_config, next_target)?;
    write_runtime_config(&config_path, &next_config)
}

fn read_runtime_config(config_path: &Path) -> Result<Value, String> {
    if !config_path.exists() {
        return Ok(default_runtime_config());
    }
    let raw = std::fs::read_to_string(config_path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?;
    if !parsed.is_object() {
        return Err("config_file_must_contain_json_object".to_string());
    }
    Ok(parsed)
}

fn write_runtime_config(config_path: &Path, config: &Value) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    std::fs::write(config_path, format!("{raw}\n")).map_err(|error| error.to_string())
}

fn default_runtime_config() -> Value {
    json!({
        "categories": [],
        "silenceProfile": {
            "thresholdDb": -40,
            "minStripMs": 50,
            "minSilenceMs": 250,
            "startPadMs": 0,
            "endPadMs": 0,
        },
        "aiNaming": {
            "enabled": false,
            "baseUrl": "",
            "model": "",
            "timeoutSeconds": 30,
            "keychainService": "openai",
            "keychainAccount": "api_key",
        },
        "uiPreferences": {
            "logsCollapsedByDefault": true,
            "followSystemTheme": true,
            "developerModeEnabled": true,
        },
        "hostPreferences": {
            "language": "system",
            "dawTarget": DEFAULT_DAW_TARGET,
            "includePrereleaseUpdates": false,
        },
    })
}

fn update_backend_target_daw_preference_config(
    current_config: Value,
    next_target: &str,
) -> Result<Value, String> {
    let mut next_config = current_config
        .as_object()
        .cloned()
        .ok_or_else(|| "Invalid config payload.".to_string())?;
    let current_host_preferences = next_config
        .get("hostPreferences")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut next_host_preferences = current_host_preferences;
    next_host_preferences.insert(
        "dawTarget".to_string(),
        Value::String(next_target.to_string()),
    );
    next_config.insert(
        "hostPreferences".to_string(),
        Value::Object(next_host_preferences),
    );
    Ok(Value::Object(next_config))
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
    let response = http_json_request(
        "POST",
        port,
        "/api/v1/capabilities/invoke",
        Some(&enriched_request),
    )?;

    if response.status_code == 200 {
        Ok(response.body)
    } else {
        Ok(backend_error_response_to_capability_response(
            &enriched_request,
            response,
        ))
    }
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
    for (key, value) in backend_env_vars(&runtime_app_data_dir, &target_daw, python_home.as_deref())
    {
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
                if trimmed.starts_with(EXECUTION_LOG_PREFIX) {
                    let _ = append_execution_log_from_raw_line(&state_clone, trimmed);
                    continue;
                }
                let (level, message) = classify_backend_stderr_line(trimmed);
                if let Ok(mut backend) = state_clone.backend_state.lock() {
                    backend.logs_count += 1;
                    if level == "error" {
                        backend.last_error =
                            Some(strip_ansi_escape_sequences(trimmed).trim().to_string());
                    }
                }
                let _ = append_log(
                    &state_clone,
                    level,
                    "backend.supervisor",
                    &message,
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
        if http_json_request("GET", port, "/api/v1/health", None)
            .map(|response| response.status_code == 200)
            .unwrap_or(false)
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!("backend_not_ready_on_port_{port}"))
}

fn backend_should_restart_after_healthcheck(phase: &str, healthcheck_ok: bool) -> bool {
    !healthcheck_ok && phase != "starting"
}

fn ensure_backend_available(state: &Arc<RuntimeState>) -> Result<(), String> {
    let (port, phase) = {
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
        (backend.port, backend.phase.clone())
    };

    let healthcheck_ok = http_json_request("GET", port, "/api/v1/health", None)
        .map(|response| response.status_code == 200)
        .unwrap_or(false);

    if healthcheck_ok {
        return Ok(());
    }

    if phase == "starting" {
        return wait_for_backend_ready(state);
    }

    if !backend_should_restart_after_healthcheck(&phase, healthcheck_ok) {
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
) -> Result<HttpJsonResponse, String> {
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
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "backend_http_invalid_status".to_string())?;

    let parsed_body = if body_text.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(body_text)
            .map_err(|error| format!("backend_http_json_failed:{error}"))?
    };

    Ok(HttpJsonResponse {
        status_code,
        status_line: status_line.to_string(),
        body: parsed_body,
    })
}

fn http_json_request_ok(
    method: &str,
    port: u16,
    path: &str,
    body: Option<&Value>,
) -> Result<Value, String> {
    let response = http_json_request(method, port, path, body)?;
    if response.status_code == 200 {
        Ok(response.body)
    } else {
        Err(format!(
            "backend_http_status_failed:{}",
            response.status_line
        ))
    }
}

fn backend_error_response_to_capability_response(
    request: &Value,
    response: HttpJsonResponse,
) -> Value {
    let request_id = request.get("requestId").cloned().unwrap_or(Value::Null);
    let capability = request.get("capability").cloned().unwrap_or(Value::Null);

    json!({
        "success": false,
        "requestId": request_id,
        "capability": capability,
        "error": normalize_backend_error_payload(request, &response),
    })
}

fn normalize_backend_error_payload(request: &Value, response: &HttpJsonResponse) -> Value {
    let capability = request.get("capability").and_then(Value::as_str);
    let body = response.body.as_object();
    let code = body
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        .unwrap_or("BACKEND_HTTP_STATUS_FAILED");
    let message = body
        .and_then(|value| value.get("message"))
        .and_then(Value::as_str)
        .unwrap_or(&response.status_line);
    let source = body
        .and_then(|value| value.get("source"))
        .and_then(Value::as_str)
        .unwrap_or("runtime");
    let retryable = body
        .and_then(|value| value.get("retryable"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let adapter = body
        .and_then(|value| value.get("adapter"))
        .cloned()
        .unwrap_or(Value::Null);

    let mut details = body
        .and_then(|value| value.get("details"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    details.insert("statusCode".to_string(), json!(response.status_code));
    details.insert("statusLine".to_string(), json!(response.status_line));

    json!({
        "code": code,
        "message": message,
        "details": Value::Object(details),
        "source": source,
        "retryable": retryable,
        "capability": body
            .and_then(|value| value.get("capability"))
            .cloned()
            .or_else(|| capability.map(|value| json!(value)))
            .unwrap_or(Value::Null),
        "adapter": adapter,
    })
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
        "workflowScope": raw.get("workflow_scope").cloned().unwrap_or(Value::Null),
        "portability": raw.get("portability").cloned().unwrap_or(Value::Null),
        "supportedDaws": raw.get("supported_daws").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "canonicalSource": raw.get("canonical_source").cloned().unwrap_or(Value::Null),
        "fieldSupport": field_support,
        "implementations": raw.get("implementations").cloned().unwrap_or_else(|| Value::Object(Map::new())),
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
        next_payload.insert(
            "allowedCapabilities".to_string(),
            allowed_capabilities.clone(),
        );
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
    use super::{
        backend_env_vars, backend_error_response_to_capability_response,
        backend_should_restart_after_healthcheck, classify_backend_stderr_line,
        update_backend_target_daw_preference_config, HttpJsonResponse,
    };
    use serde_json::{json, Value};
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

    #[test]
    fn backend_error_response_to_capability_response_preserves_structured_backend_error_payloads() {
        let response = backend_error_response_to_capability_response(
            &json!({
                "requestId": "req-1",
                "capability": "system.health",
            }),
            HttpJsonResponse {
                status_code: 404,
                status_line: "HTTP/1.1 404 Not Found".to_string(),
                body: json!({
                    "code": "VALIDATION_ERROR",
                    "message": "Capability not found: system.health",
                    "details": {
                        "capability_id": "system.health",
                    },
                    "source": "runtime",
                    "retryable": false,
                    "capability": "system.health",
                }),
            },
        );

        assert_eq!(
            response.get("success").and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            response.get("requestId").and_then(Value::as_str),
            Some("req-1")
        );
        assert_eq!(
            response
                .get("error")
                .and_then(Value::as_object)
                .and_then(|error| error.get("code"))
                .and_then(Value::as_str),
            Some("VALIDATION_ERROR")
        );
        assert_eq!(
            response
                .get("error")
                .and_then(Value::as_object)
                .and_then(|error| error.get("details"))
                .and_then(Value::as_object)
                .and_then(|details| details.get("statusCode"))
                .and_then(Value::as_u64),
            Some(404)
        );
    }

    #[test]
    fn classify_backend_stderr_line_maps_uvicorn_info_to_info_level() {
        let (level, message) = classify_backend_stderr_line(
            "\u{1b}[32mINFO\u{1b}[0m:     Uvicorn running on \u{1b}[1mhttp://127.0.0.1:18500\u{1b}[0m",
        );

        assert_eq!(level, "info");
        assert_eq!(
            message,
            "backend.stderr INFO:     Uvicorn running on http://127.0.0.1:18500"
        );
    }

    #[test]
    fn target_daw_preference_update_preserves_existing_config() {
        let next_config = update_backend_target_daw_preference_config(
            json!({
                "categories": [{"id": "dialog"}],
                "uiPreferences": {
                    "developerModeEnabled": false,
                },
                "hostPreferences": {
                    "language": "zh-CN",
                    "dawTarget": "pro_tools",
                    "includePrereleaseUpdates": true,
                },
            }),
            "pro_tools",
        )
        .expect("config update should succeed");

        assert_eq!(
            next_config
                .get("categories")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("id"))
                .and_then(Value::as_str),
            Some("dialog")
        );
        assert_eq!(
            next_config
                .get("hostPreferences")
                .and_then(Value::as_object)
                .and_then(|host_preferences| host_preferences.get("language"))
                .and_then(Value::as_str),
            Some("zh-CN")
        );
        assert_eq!(
            next_config
                .get("hostPreferences")
                .and_then(Value::as_object)
                .and_then(|host_preferences| host_preferences.get("dawTarget"))
                .and_then(Value::as_str),
            Some("pro_tools")
        );
    }

    #[test]
    fn backend_healthcheck_does_not_restart_while_backend_is_starting() {
        assert!(!backend_should_restart_after_healthcheck("starting", false));
    }

    #[test]
    fn backend_healthcheck_restarts_running_backend_when_healthcheck_fails() {
        assert!(backend_should_restart_after_healthcheck("running", false));
    }
}

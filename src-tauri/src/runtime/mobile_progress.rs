use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Arc,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use super::{backend, run_process_capture, timestamp_now, RuntimeState};

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

pub(super) struct MobileProgressState {
    origin: Option<String>,
    server_started: bool,
    sessions: HashMap<String, MobileProgressSessionRecord>,
}

pub(super) fn initial_state() -> MobileProgressState {
    MobileProgressState {
        origin: None,
        server_started: false,
        sessions: HashMap::new(),
    }
}

pub(super) fn create_mobile_progress_session(
    state: &Arc<RuntimeState>,
    task_id: &str,
) -> Result<Value, String> {
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

pub(super) fn close_mobile_progress_session(
    state: &Arc<RuntimeState>,
    session_id: &str,
) -> Result<Value, String> {
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

pub(super) fn get_mobile_progress_view_url(
    state: &Arc<RuntimeState>,
    session_id: &str,
) -> Result<Value, String> {
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

pub(super) fn update_mobile_progress_session(
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
    let read_count = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;
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
        .find_map(|entry| {
            entry
                .split_once('=')
                .and_then(|(key, value)| (key == "token").then_some(value))
        })
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
            write_http_response(
                &mut stream,
                403,
                "text/html; charset=utf-8",
                "<h1>Session not found.</h1>",
            )?;
            return Ok(());
        };
        if token != session.token {
            write_http_response(
                &mut stream,
                403,
                "text/html; charset=utf-8",
                "<h1>Session not found.</h1>",
            )?;
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

    write_http_response(
        &mut stream,
        404,
        "text/html; charset=utf-8",
        "<h1>Not Found</h1>",
    )
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

fn load_mobile_progress_job_view(
    state: &Arc<RuntimeState>,
    task_id: &str,
) -> Result<Value, String> {
    let response = backend::invoke_backend_capability(
        state,
        json!({
            "requestId": format!("mobile-progress-{}", super::unique_suffix()),
            "capability": "jobs.get",
            "payload": {
                "jobId": task_id,
            },
            "meta": backend::runtime_meta("mobile-progress"),
        }),
    )?;
    let job = backend::extract_capability_data(response, "Failed to load progress.")?;
    Ok(derive_mobile_progress_job_view(&job))
}

fn derive_mobile_progress_job_view(job: &Value) -> Value {
    let progress = job
        .get("progress")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let metadata = job
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let result = job
        .get("result")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
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

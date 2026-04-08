mod runtime;

use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use tauri::{AppHandle, Manager, State};

pub(crate) fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf()
}

pub(crate) fn resolve_runtime_resources_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(repo_root());
    }

    let bundled_resources_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let bundled_backend_dir = bundled_resources_dir.join("backend");

    if bundled_backend_dir.exists() {
        Ok(bundled_resources_dir)
    } else {
        Ok(repo_root())
    }
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
    state: State<'_, Arc<runtime::RuntimeState>>,
    operation: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    match operation.as_str() {
        "app.version.get" => Ok(Value::String(app.package_info().version.to_string())),
        "backend.capability.invoke" => runtime::invoke(state.inner(), &operation, args),
        _ => runtime::invoke(state.inner(), &operation, args),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let runtime_state = runtime::initialize(app.handle().clone())?;
            app.manage(Arc::new(runtime_state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_ready, runtime_invoke])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

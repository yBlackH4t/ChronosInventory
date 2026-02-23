#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    error::Error,
    fs::{create_dir_all, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, SystemTime},
};

use tauri::{api::process::{Command, CommandEvent, Encoding}, Manager, RunEvent};
use tokio::time::sleep;

struct BackendState(Mutex<Option<tauri::api::process::CommandChild>>);

const SIDECAR_NAME: &str = "estoque_backend";
const SIDECAR_ENV_PORT: &str = "8000";
const SIDECAR_ENV_APP_PROD: &str = "prod";
const SIDECAR_ENV_APP_DEV: &str = "dev";

fn log_path() -> PathBuf {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(base).join("ChronosInventory").join("logs").join("tauri.log");
    }
    std::env::temp_dir().join("chronos_inventory_tauri.log")
}

fn log_line(message: &str) {
    let paths = [
        log_path(),
        std::env::temp_dir().join("chronos_inventory_tauri.log"),
    ];

    for path in paths {
        if let Some(parent) = path.parent() {
            let _ = create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{:?} {}", SystemTime::now(), message);
        }
    }
}

async fn wait_for_health(url: &str, timeout: Duration) -> bool {
    let client = reqwest::Client::new();
    let mut delay = Duration::from_millis(300);
    let mut elapsed = Duration::from_millis(0);

    loop {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                return true;
            }
        }

        if elapsed >= timeout {
            return false;
        }

        sleep(delay).await;
        elapsed += delay;
        delay = std::cmp::min(
            Duration::from_millis((delay.as_millis() as f32 * 1.5) as u64),
            Duration::from_secs(2),
        );
    }
}

fn log_startup_paths(app: &tauri::App) {
    let resource_dir = app.path_resolver().resource_dir();
    let app_data_dir = app.path_resolver().app_data_dir();
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));

    log_line(&format!("resource_dir={:?}", resource_dir));
    log_line(&format!("app_data_dir={:?}", app_data_dir));
    log_line(&format!("current_exe_dir={:?}", exe_dir));

    let mut candidates: Vec<(&str, Option<PathBuf>)> = Vec::new();
    let base_exe = format!("{SIDECAR_NAME}.exe");
    let triple_exe = format!("{SIDECAR_NAME}-x86_64-pc-windows-msvc.exe");

    if let Some(ref dir) = resource_dir {
        candidates.push(("resource_dir/estoque_backend.exe", Some(dir.join(&base_exe))));
        candidates.push(("resource_dir/estoque_backend-x86_64-pc-windows-msvc.exe", Some(dir.join(&triple_exe))));
        candidates.push(("resource_dir/bin/estoque_backend.exe", Some(dir.join("bin").join(&base_exe))));
        candidates.push(("resource_dir/bin/estoque_backend-x86_64-pc-windows-msvc.exe", Some(dir.join("bin").join(&triple_exe))));
    }
    if let Some(ref dir) = app_data_dir {
        candidates.push(("app_data_dir/estoque_backend.exe", Some(dir.join(&base_exe))));
        candidates.push(("app_data_dir/estoque_backend-x86_64-pc-windows-msvc.exe", Some(dir.join(&triple_exe))));
    }
    if let Some(ref dir) = exe_dir {
        candidates.push(("exe_dir/estoque_backend.exe", Some(dir.join(&base_exe))));
        candidates.push(("exe_dir/estoque_backend-x86_64-pc-windows-msvc.exe", Some(dir.join(&triple_exe))));
    }

    for (label, path_opt) in candidates {
        if let Some(path) = path_opt {
            log_line(&format!("{label} exists={} path={}", path.exists(), path.display()));
        }
    }
}

fn spawn_backend() -> Result<(tauri::api::process::CommandChild, tauri::async_runtime::Receiver<CommandEvent>), Box<dyn Error>> {
    let app_env = if cfg!(debug_assertions) {
        SIDECAR_ENV_APP_DEV
    } else {
        SIDECAR_ENV_APP_PROD
    };
    let mut envs = HashMap::from([
        ("PORT".to_string(), SIDECAR_ENV_PORT.to_string()),
        ("APP_ENV".to_string(), app_env.to_string()),
        // Evita logs em cp1252 que quebram parser UTF-8 do Tauri.
        ("PYTHONUTF8".to_string(), "1".to_string()),
        ("PYTHONIOENCODING".to_string(), "utf-8".to_string()),
    ]);
    if let Ok(custom_app_dir) = std::env::var("CHRONOS_APP_DIR") {
        if !custom_app_dir.trim().is_empty() {
            envs.insert("CHRONOS_APP_DIR".to_string(), custom_app_dir);
        }
    }
    log_line(&format!(
        "spawn sidecar: name={} PORT={} APP_ENV={} CHRONOS_APP_DIR={}",
        SIDECAR_NAME,
        SIDECAR_ENV_PORT,
        app_env,
        envs.get("CHRONOS_APP_DIR").cloned().unwrap_or_else(|| "(inherit/default)".to_string())
    ));
    let mut cmd = Command::new_sidecar(SIDECAR_NAME)?.envs(envs);
    if let Some(enc) = Encoding::for_label(b"utf-8") {
        cmd = cmd.encoding(enc);
    }
    let (rx, child) = cmd.spawn()?;
    Ok((child, rx))
}

fn stop_backend(app: &tauri::AppHandle, reason: &str) {
    let child = app.state::<BackendState>().0.lock().unwrap().take();
    if let Some(child) = child {
        match child.kill() {
            Ok(_) => log_line(&format!("backend finalizado ({reason})")),
            Err(err) => log_line(&format!("falha ao finalizar backend ({reason}): {err}")),
        }
    } else {
        log_line(&format!("backend ja estava encerrado ({reason})"));
    }
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    log_line("restart_app command invoked");
    stop_backend(&app, "restart_app_command");
    std::thread::sleep(Duration::from_millis(450));
    app.restart();
    Ok(())
}

fn main() {
    log_line("main start");
    std::panic::set_hook(Box::new(|info| {
        log_line(&format!("panic: {info}"));
    }));

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![restart_app])
        .manage(BackendState(Mutex::new(None)))
        .setup(|app| {
            log_line("App setup iniciado");
            log_startup_paths(app);
            let window = match app.get_window("main") {
                Some(win) => win,
                None => {
                    log_line("Janela principal nao encontrada (label 'main').");
                    return Ok(());
                }
            };

            window.hide()?;

            match spawn_backend() {
                Ok((child, mut rx)) => {
                    log_line("Backend iniciado");
                    *app.state::<BackendState>().0.lock().unwrap() = Some(child);
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    log_line(&format!("backend stdout: {line}"));
                                }
                                CommandEvent::Stderr(line) => {
                                    log_line(&format!("backend stderr: {line}"));
                                }
                                CommandEvent::Error(err) => {
                                    log_line(&format!("backend error: {err}"));
                                }
                                CommandEvent::Terminated(payload) => {
                                    log_line(&format!(
                                        "backend terminated: code={:?} signal={:?}",
                                        payload.code, payload.signal
                                    ));
                                }
                                _ => {}
                            }
                        }
                    });
                }
                Err(err) => {
                    log_line(&format!("Falha ao iniciar backend: {err}"));
                }
            }

            let window_clone = window.clone();
            tauri::async_runtime::spawn(async move {
                let ok = wait_for_health("http://127.0.0.1:8000/health", Duration::from_secs(20)).await;
                if !ok {
                    log_line("Backend healthcheck falhou. Mostrando UI mesmo assim.");
                }
                let _ = window_clone.show();
            });

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                let app = event.window().app_handle();
                stop_backend(&app, "close_requested");
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { .. } => {
            stop_backend(app, "exit_requested");
        }
        RunEvent::Exit => {
            stop_backend(app, "exit");
        }
        _ => {}
    });
}

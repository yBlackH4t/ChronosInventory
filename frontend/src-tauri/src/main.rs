#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    error::Error,
    fs::{self, create_dir_all, OpenOptions},
    io::Write,
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::Command as StdCommand,
    sync::{
        atomic::{AtomicBool, AtomicU16, AtomicU32, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tokio::time::sleep;

mod auto_update;
use auto_update::{AfterUpdate, AfterUpdateMarker, PendingUpdate};

struct BackendState(Mutex<Option<CommandChild>>);

const SIDECAR_NAME: &str = "estoque_backend";
const DEFAULT_BACKEND_PORT: u16 = 8000;
// Se outro programa ocupar a 8000, o backend usa a primeira livre desta faixa.
const FALLBACK_PORTS: std::ops::RangeInclusive<u16> = 8001..=8099;
// O backend que cai sozinho e religado ate este numero de vezes por sessao.
const MAX_BACKEND_RESTARTS: u32 = 5;
// Ao abrir com o Windows: comeca escondido na bandeja.
const TRAY_START_ARG: &str = "--bandeja";
const AUTOSTART_REG_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_REG_VALUE: &str = "Chronos Inventory";

static BACKEND_PORT: AtomicU16 = AtomicU16::new(DEFAULT_BACKEND_PORT);
// Ligado quando o proprio app encerra o backend (fechar, atualizar, reiniciar): nao religa.
static BACKEND_STOPPING: AtomicBool = AtomicBool::new(false);
static BACKEND_RESTARTS: AtomicU32 = AtomicU32::new(0);
static QUITTING: AtomicBool = AtomicBool::new(false);

fn backend_port() -> u16 {
    BACKEND_PORT.load(Ordering::SeqCst)
}

fn backend_url(path: &str) -> String {
    format!("http://127.0.0.1:{}{}", backend_port(), path)
}
const SIDECAR_ENV_APP_PROD: &str = "prod";
const SIDECAR_ENV_APP_DEV: &str = "dev";

const LOG_MAX_BYTES: u64 = 1_000_000;

// Um log so, na pasta do app (a mesma do banco e do backend.log), com tamanho limitado:
// passou de 1 MB, vira tauri.log.1 (o anterior e descartado).
fn log_path() -> PathBuf {
    if let Ok(base) = std::env::var("APPDATA") {
        let folder = if cfg!(debug_assertions) {
            "Chronos InventoryDev"
        } else {
            "Chronos Inventory"
        };
        return PathBuf::from(base)
            .join(folder)
            .join("logs")
            .join("tauri.log");
    }
    std::env::temp_dir().join("chronos_inventory_tauri.log")
}

fn log_line(message: &str) {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }
    if fs::metadata(&path)
        .map(|m| m.len() > LOG_MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, path.with_extension("log.1"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{:?} {}", SystemTime::now(), message);
    }
}

// Ate a 2.5.2 o log ia para dois lugares fora da pasta do app e crescia sem limite.
fn remove_legacy_logs() {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        let folder = PathBuf::from(base).join("ChronosInventory");
        let logs = folder.join("logs");
        let _ = fs::remove_file(logs.join("tauri.log"));
        // remove_dir so apaga pasta vazia: nada alem do log antigo e tocado.
        let _ = fs::remove_dir(&logs);
        let _ = fs::remove_dir(&folder);
    }
    if log_path() != std::env::temp_dir().join("chronos_inventory_tauri.log") {
        let _ = fs::remove_file(std::env::temp_dir().join("chronos_inventory_tauri.log"));
    }
}

// Preferencias do programa (nao do estoque): ficam ao lado do log, por computador.
#[derive(Serialize, Deserialize, Clone)]
struct DesktopPrefs {
    #[serde(default = "default_true")]
    fechar_para_bandeja: bool,
    // Ultima atualizacao baixada: se ficou sem instalar (PC desligado), instala ao abrir.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    versao_baixada: Option<String>,
    // Como reabrir depois que o instalador termina (bandeja ou fechado).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    depois_de_atualizar: Option<AfterUpdateMarker>,
}

fn default_true() -> bool {
    true
}

impl Default for DesktopPrefs {
    fn default() -> Self {
        Self {
            fechar_para_bandeja: true,
            versao_baixada: None,
            depois_de_atualizar: None,
        }
    }
}

fn prefs_path() -> PathBuf {
    log_path()
        .parent()
        .and_then(|logs| logs.parent())
        .map(|dir| dir.join("desktop.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("chronos_desktop.json"))
}

fn load_prefs() -> DesktopPrefs {
    fs::read_to_string(prefs_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_prefs(prefs: &DesktopPrefs) -> Result<(), String> {
    let path = prefs_path();
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }
    let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> StdCommand {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = StdCommand::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(target_os = "windows")]
fn autostart_enabled() -> bool {
    hidden_command("reg")
        .args(["query", AUTOSTART_REG_KEY, "/v", AUTOSTART_REG_VALUE])
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn autostart_enabled() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    let output = if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let command = format!("\"{}\" {}", exe.display(), TRAY_START_ARG);
        hidden_command("reg")
            .args([
                "add",
                AUTOSTART_REG_KEY,
                "/v",
                AUTOSTART_REG_VALUE,
                "/t",
                "REG_SZ",
                "/d",
                command.as_str(),
                "/f",
            ])
            .output()
    } else {
        if !autostart_enabled() {
            return Ok(());
        }
        hidden_command("reg")
            .args(["delete", AUTOSTART_REG_KEY, "/v", AUTOSTART_REG_VALUE, "/f"])
            .output()
    }
    .map_err(|e| e.to_string())?;
    if output.status.success() {
        log_line(&format!("abrir com o Windows: {enabled}"));
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn set_autostart_enabled(_enabled: bool) -> Result<(), String> {
    Err("Disponivel so no Windows.".to_string())
}

#[derive(Serialize)]
struct DesktopSettings {
    fechar_para_bandeja: bool,
    abrir_com_windows: bool,
    porta_backend: u16,
}

#[tauri::command]
fn desktop_settings() -> DesktopSettings {
    DesktopSettings {
        fechar_para_bandeja: load_prefs().fechar_para_bandeja,
        abrir_com_windows: autostart_enabled(),
        porta_backend: backend_port(),
    }
}

#[tauri::command]
fn set_desktop_settings(
    fechar_para_bandeja: Option<bool>,
    abrir_com_windows: Option<bool>,
) -> Result<DesktopSettings, String> {
    if let Some(value) = fechar_para_bandeja {
        let mut prefs = load_prefs();
        prefs.fechar_para_bandeja = value;
        save_prefs(&prefs)?;
    }
    if let Some(value) = abrir_com_windows {
        set_autostart_enabled(value)?;
    }
    Ok(desktop_settings())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit_app(app: &tauri::AppHandle) {
    if auto_update::is_installing() {
        // O instalador ja vai fechar o Chronos; sair agora cortaria a copia de seguranca.
        return;
    }
    // Com atualizacao baixada, sair e a hora de instalar; o Chronos continua fechado depois.
    if auto_update::has_pending(app) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if !auto_update::install_pending(&app, AfterUpdate::Fechar).await {
                exit_app(&app);
            }
        });
        return;
    }
    exit_app(app);
}

fn exit_app(app: &tauri::AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    stop_backend(app, "tray_quit");
    app.exit(0);
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "abrir", "Abrir o Chronos", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "sair", "Sair do Chronos", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut builder = TrayIconBuilder::with_id("chronos")
        .tooltip("Chronos Inventory")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "abrir" => show_main_window(app),
            "sair" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
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
    let resource_dir = app.path().resource_dir().ok();
    let app_data_dir = app.path().app_data_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    log_line(&format!("resource_dir={:?}", resource_dir));
    log_line(&format!("app_data_dir={:?}", app_data_dir));
    log_line(&format!("current_exe_dir={:?}", exe_dir));

    let mut candidates: Vec<(&str, Option<PathBuf>)> = Vec::new();
    let base_exe = format!("{SIDECAR_NAME}.exe");
    let triple_exe = format!("{SIDECAR_NAME}-x86_64-pc-windows-msvc.exe");

    if let Some(ref dir) = resource_dir {
        candidates.push((
            "resource_dir/estoque_backend.exe",
            Some(dir.join(&base_exe)),
        ));
        candidates.push((
            "resource_dir/estoque_backend-x86_64-pc-windows-msvc.exe",
            Some(dir.join(&triple_exe)),
        ));
        candidates.push((
            "resource_dir/bin/estoque_backend.exe",
            Some(dir.join("bin").join(&base_exe)),
        ));
        candidates.push((
            "resource_dir/bin/estoque_backend-x86_64-pc-windows-msvc.exe",
            Some(dir.join("bin").join(&triple_exe)),
        ));
    }
    if let Some(ref dir) = app_data_dir {
        candidates.push((
            "app_data_dir/estoque_backend.exe",
            Some(dir.join(&base_exe)),
        ));
        candidates.push((
            "app_data_dir/estoque_backend-x86_64-pc-windows-msvc.exe",
            Some(dir.join(&triple_exe)),
        ));
    }
    if let Some(ref dir) = exe_dir {
        candidates.push(("exe_dir/estoque_backend.exe", Some(dir.join(&base_exe))));
        candidates.push((
            "exe_dir/estoque_backend-x86_64-pc-windows-msvc.exe",
            Some(dir.join(&triple_exe)),
        ));
    }

    for (label, path_opt) in candidates {
        if let Some(path) = path_opt {
            log_line(&format!(
                "{label} exists={} path={}",
                path.exists(),
                path.display()
            ));
        }
    }
}

fn spawn_backend(
    app: &tauri::AppHandle,
) -> Result<(CommandChild, tauri::async_runtime::Receiver<CommandEvent>), Box<dyn Error>> {
    let app_env = if cfg!(debug_assertions) {
        SIDECAR_ENV_APP_DEV
    } else {
        SIDECAR_ENV_APP_PROD
    };
    let mut envs = HashMap::from([
        ("PORT".to_string(), backend_port().to_string()),
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
        backend_port(),
        app_env,
        envs.get("CHRONOS_APP_DIR")
            .cloned()
            .unwrap_or_else(|| "(inherit/default)".to_string())
    ));
    let cmd = app.shell().sidecar(SIDECAR_NAME)?.envs(envs);
    let (rx, child) = cmd.spawn()?;
    Ok((child, rx))
}

fn start_backend(app: &tauri::AppHandle) {
    BACKEND_STOPPING.store(false, Ordering::SeqCst);
    match spawn_backend(app) {
        Ok((child, mut rx)) => {
            log_line("Backend iniciado");
            *app.state::<BackendState>().0.lock().unwrap() = Some(child);
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log_line(&format!("backend stdout: {}", String::from_utf8_lossy(&line)));
                        }
                        CommandEvent::Stderr(line) => {
                            log_line(&format!("backend stderr: {}", String::from_utf8_lossy(&line)));
                        }
                        CommandEvent::Error(err) => {
                            log_line(&format!("backend error: {err}"));
                        }
                        CommandEvent::Terminated(payload) => {
                            log_line(&format!(
                                "backend terminated: code={:?} signal={:?}",
                                payload.code, payload.signal
                            ));
                            restart_backend_after_crash(&handle).await;
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
}

// O backend caiu sem o app pedir: religa (o robo do WhatsApp e o backup moram nele).
async fn restart_backend_after_crash(app: &tauri::AppHandle) {
    if BACKEND_STOPPING.load(Ordering::SeqCst) || QUITTING.load(Ordering::SeqCst) {
        return;
    }
    let attempt = BACKEND_RESTARTS.fetch_add(1, Ordering::SeqCst) + 1;
    if attempt > MAX_BACKEND_RESTARTS {
        log_line("backend caiu de novo; limite de religamentos atingido");
        let _ = app.emit("backend-status", "parado");
        return;
    }
    app.state::<BackendState>().0.lock().unwrap().take();
    let _ = app.emit("backend-status", "religando");
    log_line(&format!("religando o backend (tentativa {attempt})"));
    sleep(Duration::from_secs(2)).await;
    if BACKEND_STOPPING.load(Ordering::SeqCst) || QUITTING.load(Ordering::SeqCst) {
        return;
    }
    if !wait_backend_port_release(Duration::from_secs(5)) {
        force_kill_backend_processes();
    }
    start_backend(app);
    let ok = wait_for_health(&backend_url("/health"), Duration::from_secs(30)).await;
    let _ = app.emit("backend-status", if ok { "ok" } else { "parado" });
}

fn stop_backend(app: &tauri::AppHandle, reason: &str) {
    BACKEND_STOPPING.store(true, Ordering::SeqCst);
    let child = app.state::<BackendState>().0.lock().unwrap().take();
    if let Some(child) = child {
        match child.kill() {
            Ok(_) => log_line(&format!("backend finalizado ({reason})")),
            Err(err) => log_line(&format!("falha ao finalizar backend ({reason}): {err}")),
        }
    } else {
        log_line(&format!("backend ja estava encerrado ({reason})"));
    }
    
    // Garantia extra: builds antigos (onefile) tinham um processo filho que o child.kill()
    // nao alcancava, e um backend de versao anterior pode ter ficado aberto. So quando a porta
    // continua ocupada: ao fechar o app, stop_backend roda ate 3 vezes (fechar janela, sair) e
    // cada taskkill piscava um prompt.
    if !wait_backend_port_release(Duration::from_millis(800)) {
        force_kill_backend_processes();
    }
}

fn is_port_free(port: u16) -> bool {
    // O backend escuta em 0.0.0.0, e no Windows o bind em 127.0.0.1 funciona mesmo assim: o
    // teste dizia "livre" com o backend antigo rodando (2.3.0 -> 2.4.0). Quem atende uma
    // conexao na porta ocupa a porta.
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
        return false;
    }
    TcpListener::bind(("0.0.0.0", port)).is_ok() && TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn is_backend_port_free() -> bool {
    is_port_free(backend_port())
}

fn wait_backend_port_release(timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if is_backend_port_free() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    is_backend_port_free()
}

#[cfg(target_os = "windows")]
fn taskkill_image(image_name: &str) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000; // sem a janela de prompt piscando
    match StdCommand::new("taskkill")
        .args(["/F", "/T", "/IM", image_name])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            log_line(&format!(
                "taskkill {image_name}: code={:?} stdout={} stderr={}",
                output.status.code(),
                if stdout.is_empty() {
                    "-"
                } else {
                    stdout.as_str()
                },
                if stderr.is_empty() {
                    "-"
                } else {
                    stderr.as_str()
                }
            ));
        }
        Err(err) => log_line(&format!("taskkill {image_name} falhou: {err}")),
    }
}

#[cfg(target_os = "windows")]
fn force_kill_backend_processes() {
    taskkill_image("estoque_backend.exe");
    taskkill_image("estoque_backend-x86_64-pc-windows-msvc.exe");
}

#[cfg(not(target_os = "windows"))]
fn force_kill_backend_processes() {}

fn ensure_backend_slot_available() {
    if is_backend_port_free() {
        log_line(&format!("startup: porta {} livre", backend_port()));
        return;
    }

    log_line("startup: porta 8000 ocupada antes de iniciar sidecar; limpando processos antigos");
    force_kill_backend_processes();
    std::thread::sleep(Duration::from_millis(400));

    if wait_backend_port_release(Duration::from_secs(4)) {
        log_line("startup: porta 8000 liberada apos limpeza preventiva");
        return;
    }

    // Outro programa (nao um Chronos antigo) usa a 8000: o backend vai para outra porta.
    match FALLBACK_PORTS.clone().find(|port| is_port_free(*port)) {
        Some(port) => {
            BACKEND_PORT.store(port, Ordering::SeqCst);
            log_line(&format!("startup: porta 8000 ocupada por outro programa; usando {port}"));
        }
        None => log_line("startup: nenhuma porta livre entre 8001 e 8099; tentando a 8000"),
    }
}

#[tauri::command]
fn kill_backend(app: tauri::AppHandle) -> Result<(), String> {
    log_line("kill_backend command invoked");
    stop_backend(&app, "kill_backend_command");

    if !wait_backend_port_release(Duration::from_secs(3)) {
        log_line("porta do backend ainda ocupada apos stop_backend, forcando kill");
        force_kill_backend_processes();
        std::thread::sleep(Duration::from_millis(300));
    }
    Ok(())
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    log_line("restart_app command invoked");
    stop_backend(&app, "restart_app_command");

    if !wait_backend_port_release(Duration::from_secs(3)) {
        log_line("porta do backend ainda ocupada apos stop_backend");
        force_kill_backend_processes();
        std::thread::sleep(Duration::from_millis(300));
    }

    if !wait_backend_port_release(Duration::from_secs(3)) {
        log_line("porta do backend ainda ocupada antes do restart; prosseguindo mesmo assim");
    }

    app.restart();
    // Ok(())
}

fn main() {
    log_line("main start");
    std::panic::set_hook(Box::new(|info| {
        log_line(&format!("panic: {info}"));
    }));

    let after_update = auto_update::take_after_update();
    if after_update == AfterUpdate::Fechar {
        // Atualizado ao sair: o instalador reabre o Chronos, mas a pessoa tinha fechado.
        log_line("atualizado ao sair: continua fechado");
        return;
    }
    let start_in_tray =
        std::env::args().any(|arg| arg == TRAY_START_ARG) || after_update == AfterUpdate::Bandeja;

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            restart_app,
            kill_backend,
            desktop_settings,
            set_desktop_settings,
            auto_update::atualizacao_estado,
            auto_update::instalar_atualizacao_agora
        ])
        .manage(BackendState(Mutex::new(None)))
        .manage(PendingUpdate::default())
        .setup(move |app| {
            remove_legacy_logs();
            log_line("App setup iniciado");
            log_startup_paths(app);
            ensure_backend_slot_available();

            // A janela e criada aqui (create: false no tauri.conf) para a tela saber a porta do
            // backend antes do primeiro pedido.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned();
            let window = match config {
                Some(config) => WebviewWindowBuilder::from_config(app.handle(), &config)?
                    .initialization_script(format!(
                        "window.__CHRONOS_API_PORT__ = {};",
                        backend_port()
                    ))
                    .visible(false)
                    .build()?,
                None => {
                    log_line("Configuracao da janela principal nao encontrada (label 'main').");
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                        .visible(false)
                        .build()?
                }
            };

            if let Err(err) = build_tray(app.handle()) {
                log_line(&format!("Falha ao criar o icone da bandeja: {err}"));
            }

            start_backend(app.handle());

            let window_clone = window.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let ok = wait_for_health(&backend_url("/health"), Duration::from_secs(20)).await;
                if !ok {
                    log_line("Backend healthcheck falhou. Mostrando UI mesmo assim.");
                }
                if start_in_tray {
                    log_line("aberto com o Windows: fica na bandeja");
                } else {
                    let _ = window_clone.show();
                }
                auto_update::spawn_checker(app_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let to_tray = load_prefs().fechar_para_bandeja;
                if !QUITTING.load(Ordering::SeqCst) && auto_update::has_pending(app) {
                    // Fechou a janela: ninguem esta usando, hora de instalar a atualizacao baixada.
                    api.prevent_close();
                    let _ = window.hide();
                    let after = if to_tray { AfterUpdate::Bandeja } else { AfterUpdate::Fechar };
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if !auto_update::install_pending(&app, after).await && after == AfterUpdate::Fechar {
                            exit_app(&app);
                        }
                    });
                    return;
                }
                if !QUITTING.load(Ordering::SeqCst) && to_tray {
                    // Continua ligado na bandeja: robo do WhatsApp, backup e servidor da base.
                    api.prevent_close();
                    let _ = window.hide();
                    log_line("janela escondida na bandeja");
                    return;
                }
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

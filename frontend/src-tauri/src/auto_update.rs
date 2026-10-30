// Atualizacao automatica: procura ao abrir e a cada hora, baixa escondido e instala quando
// ninguem esta usando a janela (fechou para a bandeja, "Sair do Chronos", Chronos fechado ou
// aberto escondido com o Windows). Quem esta usando so ve o aviso "reinicie quando puder".

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{
    backend_url, force_kill_backend_processes, load_prefs, log_line, save_prefs, stop_backend,
    wait_backend_port_release, QUITTING,
};

const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);
// O instalador reabre o Chronos sozinho; o aviso de como reabrir so vale logo depois.
const MARKER_MAX_AGE_SECS: u64 = 15 * 60;

static INSTALLING: AtomicBool = AtomicBool::new(false);

struct Downloaded {
    update: Update,
    bytes: Vec<u8>,
}

// Baixada e esperando, e a versao que esta sendo instalada agora (para a tela que abrir depois).
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Downloaded>>, Mutex<Option<String>>);

/// Como o Chronos volta depois que o instalador termina.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AfterUpdate {
    Abrir,
    Bandeja,
    Fechar,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AfterUpdateMarker {
    versao: String,
    modo: AfterUpdate,
    em: u64,
}

#[derive(Serialize)]
pub struct UpdateStatus {
    pronta: Option<String>,
    instalando: Option<String>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Le e apaga o aviso deixado antes de instalar. So vale se a versao aberta e a instalada:
/// se o instalador falhou, o Chronos abre normal.
pub fn take_after_update() -> AfterUpdate {
    let mut prefs = load_prefs();
    let Some(marker) = prefs.depois_de_atualizar.take() else {
        return AfterUpdate::Abrir;
    };
    let _ = save_prefs(&prefs);
    let fresh = now_secs().saturating_sub(marker.em) <= MARKER_MAX_AGE_SECS;
    if fresh && marker.versao == env!("CARGO_PKG_VERSION") {
        marker.modo
    } else {
        AfterUpdate::Abrir
    }
}

pub fn is_installing() -> bool {
    INSTALLING.load(Ordering::SeqCst)
}

pub fn has_pending(app: &AppHandle) -> bool {
    !INSTALLING.load(Ordering::SeqCst) && app.state::<PendingUpdate>().0.lock().unwrap().is_some()
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

pub fn spawn_checker(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut first = true;
        loop {
            check_and_download(&app, first).await;
            first = false;
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

async fn check_and_download(app: &AppHandle, first_check: bool) {
    if INSTALLING.load(Ordering::SeqCst) || QUITTING.load(Ordering::SeqCst) {
        return;
    }
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(err) => {
            log_line(&format!("atualizacao: updater indisponivel: {err}"));
            return;
        }
    };
    let update = match found {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(err) => {
            log_line(&format!("atualizacao: falha ao procurar: {err}"));
            return;
        }
    };
    let version = update.version.clone();
    let already = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|d| d.update.version == version);
    // Ja baixada numa sessao anterior e nunca instalada (PC desligado, por exemplo): instala ao abrir.
    let left_from_before = first_check && load_prefs().versao_baixada.as_deref() == Some(version.as_str());

    if !already {
        log_line(&format!("atualizacao: baixando {version} em segundo plano"));
        let bytes = match update.download(|_, _| {}, || {}).await {
            Ok(bytes) => bytes,
            Err(err) => {
                log_line(&format!("atualizacao: falha ao baixar {version}: {err}"));
                return;
            }
        };
        *app.state::<PendingUpdate>().0.lock().unwrap() = Some(Downloaded { update, bytes });
        let mut prefs = load_prefs();
        prefs.versao_baixada = Some(version.clone());
        let _ = save_prefs(&prefs);
        log_line(&format!("atualizacao: {version} pronta para instalar"));
    }

    if !window_visible(app) {
        install_pending(app, AfterUpdate::Bandeja).await;
    } else if left_from_before {
        install_pending(app, AfterUpdate::Abrir).await;
    } else {
        let _ = app.emit("atualizacao-pronta", &version);
    }
}

async fn backup_before_update() -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(backend_url("/backup/pre-update"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("o backend respondeu {}", resp.status()))
    }
}

/// Copia de seguranca, fecha o backend e roda o instalador, que encerra este processo e reabre
/// o Chronos do jeito de `after`. Devolve false sem mexer em nada quando nao ha atualizacao
/// baixada ou a copia de seguranca falhou.
pub async fn install_pending(app: &AppHandle, after: AfterUpdate) -> bool {
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return true;
    }
    let taken = app.state::<PendingUpdate>().0.lock().unwrap().take();
    let Some(downloaded) = taken else {
        INSTALLING.store(false, Ordering::SeqCst);
        return false;
    };
    let version = downloaded.update.version.clone();
    *app.state::<PendingUpdate>().1.lock().unwrap() = Some(version.clone());
    log_line(&format!("atualizacao: instalando {version} ({after:?})"));
    let _ = app.emit("atualizacao-instalando", &version);

    if let Err(err) = backup_before_update().await {
        log_line(&format!("atualizacao: copia de seguranca falhou, nao instalei: {err}"));
        *app.state::<PendingUpdate>().0.lock().unwrap() = Some(downloaded);
        *app.state::<PendingUpdate>().1.lock().unwrap() = None;
        INSTALLING.store(false, Ordering::SeqCst);
        let _ = app.emit("atualizacao-falhou", &version);
        return false;
    }

    let mut prefs = load_prefs();
    prefs.depois_de_atualizar = Some(AfterUpdateMarker {
        versao: version.clone(),
        modo: after,
        em: now_secs(),
    });
    let _ = save_prefs(&prefs);

    QUITTING.store(true, Ordering::SeqCst);
    stop_backend(app, "auto_update");
    if !wait_backend_port_release(Duration::from_secs(3)) {
        force_kill_backend_processes();
        std::thread::sleep(Duration::from_millis(300));
    }

    // No Windows, install() abre o instalador e encerra o processo aqui mesmo.
    if let Err(err) = downloaded.update.install(&downloaded.bytes) {
        log_line(&format!("atualizacao: instalador falhou: {err}"));
        let mut prefs = load_prefs();
        prefs.depois_de_atualizar = None;
        let _ = save_prefs(&prefs);
    }
    if after == AfterUpdate::Fechar {
        app.exit(0);
    } else {
        app.restart();
    }
    true
}

#[tauri::command]
pub fn atualizacao_estado(app: AppHandle) -> UpdateStatus {
    let pronta = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|d| d.update.version.clone());
    let instalando = app.state::<PendingUpdate>().1.lock().unwrap().clone();
    UpdateStatus { pronta, instalando }
}

#[tauri::command]
pub async fn instalar_atualizacao_agora(app: AppHandle) -> Result<(), String> {
    if install_pending(&app, AfterUpdate::Abrir).await {
        Ok(())
    } else {
        Err("Não consegui instalar agora. O Chronos tenta de novo quando for fechado.".into())
    }
}

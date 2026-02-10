//! Telegram client application

mod telegram;
mod database;
mod commands;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tauri::Manager;

/// Application state shared across all Tauri commands
pub struct AppState {
    pub db: Option<Arc<database::Database>>,
    pub client_manager: Option<Arc<telegram::TelegramClientManager>>,
    /// Pending login tokens (account_id -> LoginToken)
    pub pending_logins: Mutex<HashMap<String, grammers_client::types::LoginToken>>,
    /// Pending 2FA password tokens (account_id -> PasswordToken)
    pub pending_passwords: Mutex<HashMap<String, grammers_client::types::PasswordToken>>,
    #[allow(dead_code)]
    _logger_guard: Option<tracing_appender::non_blocking::WorkerGuard>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            db: None,
            client_manager: None,
            pending_logins: Mutex::new(HashMap::new()),
            pending_passwords: Mutex::new(HashMap::new()),
            _logger_guard: None,
        }
    }
}

/// Load .env file from parent or current directory
fn load_env() {
    let parent_dir = std::path::Path::new("../.env");
    let current_dir = std::path::Path::new(".env");

    if parent_dir.exists() {
        if let Err(e) = dotenvy::from_path(parent_dir) {
            tracing::warn!(error = %e, "Could not load .env from parent dir");
        }
    } else if current_dir.exists() {
        if let Err(e) = dotenvy::dotenv() {
            tracing::warn!(error = %e, "Could not load .env from current dir");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    std::fs::create_dir_all("logs").ok();

    let file_appender = tracing_appender::rolling::daily("logs", "telegram-client.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_line_number(true)
        .with_file(true)
        .with_max_level(tracing::Level::DEBUG)
        .init();

    tracing::info!("=== Telegram Client Started ===");
    tracing::info!("Version: {}", env!("CARGO_PKG_VERSION"));

    let mut initial_state = AppState::default();
    initial_state._logger_guard = Some(guard);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(RwLock::new(initial_state)))
        .invoke_handler(tauri::generate_handler![
            commands::request_login_code,
            commands::verify_code,
            commands::check_password,
            commands::logout,
            commands::update_api_credentials,
            commands::get_chats,
            commands::get_cached_chats,
            commands::start_loading_chats,
            commands::get_messages,
            commands::send_message,
            commands::download_media,
            commands::download_chat_photo,
        ])
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            let db_path = app_dir.join("telegram.db");
            let db = database::Database::open(&db_path).expect("Failed to open database");

            let sessions_dir = app_dir.join("sessions");
            std::fs::create_dir_all(&sessions_dir).expect("Failed to create sessions directory");

            let api_id = std::env::var("TELEGRAM_API_ID")
                .ok()
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0);

            let api_hash = std::env::var("TELEGRAM_API_HASH").unwrap_or_default();

            let client_manager =
                telegram::TelegramClientManager::new(sessions_dir, api_id, api_hash);

            let state = app.state::<Arc<RwLock<AppState>>>();
            let app_handle = app.handle().clone();

            tauri::async_runtime::block_on(async {
                if let Err(e) = client_manager.load_existing_sessions().await {
                    tracing::warn!(error = %e, "Failed to load sessions");
                }

                // Start updates handlers for loaded sessions
                let loaded_clients = client_manager.list_clients().await;
                let cm_arc = Arc::new(client_manager);

                for account_id in &loaded_clients {
                    if let Err(e) = cm_arc.start_updates(account_id, app_handle.clone()).await {
                        tracing::warn!(
                            account_id = %account_id,
                            error = %e,
                            "Failed to start updates for loaded session"
                        );
                    }
                }

                let mut state = state.write().await;
                state.db = Some(Arc::new(db));
                state.client_manager = Some(cm_arc);
            });

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

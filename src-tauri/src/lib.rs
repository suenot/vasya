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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    let initial_state = AppState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Arc::new(RwLock::new(initial_state)))
        .invoke_handler(tauri::generate_handler![
            commands::request_login_code,
            commands::verify_code,
            commands::check_password,
            commands::logout,
            commands::has_api_credentials,
            commands::update_api_credentials,
            commands::get_chats,
            commands::get_cached_chats,
            commands::start_loading_chats,
            commands::get_messages,
            commands::send_message,
            commands::send_media,
            commands::download_media,
            commands::download_chat_photo,
            commands::search_messages,
            commands::get_my_avatar,
            commands::delete_and_leave_chat,
            commands::get_stt_settings,
            commands::set_stt_settings,
            commands::transcribe_audio,
            commands::download_whisper_model,
            commands::get_whisper_models_status,
            commands::get_folders,
            commands::save_folder,
            commands::delete_folder,
            commands::get_tabs,
            commands::save_tabs,
        ])
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            // Initialize logging into app_data_dir/logs/
            let logs_dir = app_dir.join("logs");
            std::fs::create_dir_all(&logs_dir).expect("Failed to create logs directory");

            let file_appender = tracing_appender::rolling::daily(&logs_dir, "telegram-client.log");
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
            tracing::info!("App data dir: {:?}", app_dir);

            // Store logger guard in state to keep it alive
            {
                let state = app.state::<Arc<RwLock<AppState>>>();
                let mut state = tauri::async_runtime::block_on(state.write());
                state._logger_guard = Some(guard);
            }

            let db_path = app_dir.join("telegram.db");
            let db = database::Database::open(&db_path).expect("Failed to open database");

            let sessions_dir = app_dir.join("sessions");
            std::fs::create_dir_all(&sessions_dir).expect("Failed to create sessions directory");

            // Credentials baked into binary at compile time (via build.rs)
            let api_id = option_env!("TELEGRAM_API_ID")
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0);

            let api_hash = option_env!("TELEGRAM_API_HASH")
                .unwrap_or_default()
                .to_string();

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

// Telegram client modules
// Load .env file at startup
fn load_env() {
    // Try to load .env from parent directory (telegram-client/.env)
    let parent_dir = std::path::Path::new("../.env");
    let current_dir = std::path::Path::new(".env");

    let loaded = if parent_dir.exists() {
        match dotenvy::from_path(parent_dir) {
            Ok(_) => {
                eprintln!("✓ Loaded .env from parent directory");
                true
            }
            Err(e) => {
                eprintln!("Warning: Could not load .env from parent: {}", e);
                false
            }
        }
    } else if current_dir.exists() {
        match dotenvy::dotenv() {
            Ok(_) => {
                eprintln!("✓ Loaded .env from current directory");
                true
            }
            Err(e) => {
                eprintln!("Warning: Could not load .env from current: {}", e);
                false
            }
        }
    } else {
        eprintln!("Warning: No .env file found in current or parent directory");
        false
    };

    if loaded {
        if let Ok(api_id) = std::env::var("TELEGRAM_API_ID") {
            eprintln!("✓ TELEGRAM_API_ID loaded: {}", api_id);
        }
        if std::env::var("TELEGRAM_API_HASH").is_ok() {
            eprintln!("✓ TELEGRAM_API_HASH loaded");
        }
    }
}

mod config;
mod message;
mod telegram;
mod database;
mod commands;

use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Manager;

/// Application state
pub struct AppState {
    /// Database connection
    pub db: Option<Arc<database::Database>>,
    /// Telegram client manager
    pub client_manager: Option<Arc<telegram::TelegramClientManager>>,
    /// Logger guard (must be kept alive for logging to work)
    #[allow(dead_code)]
    _logger_guard: Option<tracing_appender::non_blocking::WorkerGuard>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            db: None,
            client_manager: None,
            _logger_guard: None,
        }
    }
}

// Tauri commands
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Telegram Client!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    // Create logs directory
    std::fs::create_dir_all("logs").expect("Failed to create logs directory");

    // Initialize file logging with rotation
    let file_appender = tracing_appender::rolling::daily("logs", "telegram-client.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    use tracing_subscriber::fmt::format::FmtSpan;

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_line_number(true)
        .with_file(true)
        .with_span_events(FmtSpan::FULL)
        .with_max_level(tracing::Level::DEBUG)
        .init();

    tracing::info!("=== Telegram Client Started ===");
    tracing::info!("Version: {}", env!("CARGO_PKG_VERSION"));

    // Create initial state with logger guard
    let mut initial_state = AppState::default();
    initial_state._logger_guard = Some(guard);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(RwLock::new(initial_state)))
        .invoke_handler(tauri::generate_handler![
            greet,
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
            // Initialize database
            let app_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir)
                .expect("Failed to create app data directory");

            let db_path = app_dir.join("telegram.db");
            let db = database::Database::open(&db_path)
                .expect("Failed to open database");

            // Initialize Telegram client manager
            let sessions_dir = app_dir.join("sessions");
            std::fs::create_dir_all(&sessions_dir)
                .expect("Failed to create sessions directory");

            // Get API credentials from environment variables
            let api_id = std::env::var("TELEGRAM_API_ID")
                .ok()
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0); // Will be set by user later

            let api_hash = std::env::var("TELEGRAM_API_HASH")
                .unwrap_or_else(|_| String::new());

            let client_manager = telegram::TelegramClientManager::new(
                sessions_dir,
                api_id,
                api_hash,
            );

            // Store in state
            let state = app.state::<Arc<RwLock<AppState>>>();
            tauri::async_runtime::block_on(async {
                // Load existing sessions from disk
                eprintln!("[Startup] Loading existing sessions...");
                if let Err(e) = client_manager.load_existing_sessions().await {
                    eprintln!("[Startup] Warning: Failed to load sessions: {}", e);
                } else {
                    eprintln!("[Startup] Sessions loaded successfully");
                }

                let mut state = state.write().await;
                state.db = Some(Arc::new(db));
                state.client_manager = Some(Arc::new(client_manager));
            });

            // Open DevTools in development mode
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

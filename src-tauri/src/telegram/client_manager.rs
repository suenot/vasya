//! Telegram Client Manager
//!
//! Manages multiple Telegram client sessions

use anyhow::{Context, Result};
use grammers_client::Client;
use grammers_mtsender::SenderPool;
use grammers_session::{Session, storages::SqliteSession};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::auth::UserInfo;

/// Telegram client wrapper with metadata
pub struct TelegramClientWrapper {
    pub client: Client,
    pub account_id: String,
    pub phone: String,
    pub user_info: Option<UserInfo>,
    // Don't store SenderPool here - it's been destructured for runner
}

/// Manager for multiple Telegram clients
pub struct TelegramClientManager {
    clients: Arc<RwLock<HashMap<String, Arc<TelegramClientWrapper>>>>,
    pub sessions_dir: PathBuf,
    pub api_id: i32,
    pub api_hash: String,
}

impl TelegramClientManager {
    /// Create new client manager
    pub fn new(sessions_dir: PathBuf, api_id: i32, api_hash: String) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            sessions_dir,
            api_id,
            api_hash,
        }
    }

    /// Create new client for phone number
    pub async fn create_client(&self, account_id: String, phone: String) -> Result<Arc<TelegramClientWrapper>> {
        let session_path = self.sessions_dir.join(format!("{}.session", account_id));

        // Create session
        let session = Arc::new(
            SqliteSession::open(session_path.to_str().unwrap())
                .context("Failed to open/create session file")?
        );

        // Create sender pool
        let pool = SenderPool::new(session, self.api_id);

        // Create client BEFORE destructuring pool
        let client = Client::new(&pool);

        // Destructure the pool to get runner
        let SenderPool { runner, updates: _, handle: _ } = pool;

        // Spawn the pool runner - CRITICAL for client to work!
        eprintln!("[ClientManager] Spawning SenderPool runner...");
        tokio::spawn(runner.run());
        eprintln!("[ClientManager] Telegram client created and runner started");

        let wrapper = Arc::new(TelegramClientWrapper {
            client,
            account_id: account_id.clone(),
            phone: phone.clone(),
            user_info: None,
        });

        // Store client
        let mut clients = self.clients.write().await;
        clients.insert(account_id.clone(), wrapper.clone());

        Ok(wrapper)
    }

    /// Get existing client
    pub async fn get_client(&self, account_id: &str) -> Option<Arc<TelegramClientWrapper>> {
        let clients = self.clients.read().await;
        clients.get(account_id).cloned()
    }

    /// Remove client
    pub async fn remove_client(&self, account_id: &str) -> Result<()> {
        let mut clients = self.clients.write().await;

        if let Some(wrapper) = clients.remove(account_id) {
            // Disconnect client
            wrapper.client.disconnect();

            // Remove session file
            let session_path = self.sessions_dir.join(format!("{}.session", account_id));
            if session_path.exists() {
                std::fs::remove_file(session_path)
                    .context("Failed to remove session file")?;
            }
        }

        Ok(())
    }

    /// Save session for client (session is auto-saved with SqliteSession)
    pub async fn save_session(&self, _account_id: &str) -> Result<()> {
        // SqliteSession automatically saves, so this is a no-op
        Ok(())
    }

    /// List all active clients
    pub async fn list_clients(&self) -> Vec<String> {
        let clients = self.clients.read().await;
        clients.keys().cloned().collect()
    }

    /// Load existing sessions from disk
    pub async fn load_existing_sessions(&self) -> Result<Vec<String>> {
        let mut loaded_accounts = Vec::new();

        // Check if sessions directory exists
        if !self.sessions_dir.exists() {
            eprintln!("[ClientManager] Sessions directory does not exist: {:?}", self.sessions_dir);
            return Ok(loaded_accounts);
        }

        // Iterate through session files
        let entries = std::fs::read_dir(&self.sessions_dir)
            .context("Failed to read sessions directory")?;

        for entry in entries {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();

            // Check if it's a .session file
            if path.extension().and_then(|s| s.to_str()) == Some("session") {
                if let Some(file_name) = path.file_stem().and_then(|s| s.to_str()) {
                    let account_id = file_name.to_string();
                    eprintln!("[ClientManager] Found session file for account: {}", account_id);

                    // Load the session
                    let session = Arc::new(
                        SqliteSession::open(path.to_str().unwrap())
                            .context("Failed to open session file")?
                    );

                    // Create sender pool
                    let pool = SenderPool::new(session, self.api_id);
                    let client = Client::new(&pool);

                    // Destructure and spawn runner
                    let SenderPool { runner, updates: _, handle: _ } = pool;
                    tokio::spawn(runner.run());

                    // Create wrapper (we don't know phone yet, will be empty)
                    let wrapper = Arc::new(TelegramClientWrapper {
                        client,
                        account_id: account_id.clone(),
                        phone: String::new(), // Unknown until we query user info
                        user_info: None,
                    });

                    // Store client
                    let mut clients = self.clients.write().await;
                    clients.insert(account_id.clone(), wrapper);

                    loaded_accounts.push(account_id);
                    eprintln!("[ClientManager] Loaded session for account");
                }
            }
        }

        eprintln!("[ClientManager] Loaded {} sessions from disk", loaded_accounts.len());
        Ok(loaded_accounts)
    }
}

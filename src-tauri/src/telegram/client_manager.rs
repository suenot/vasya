//! Telegram Client Manager
//!
//! Manages multiple Telegram client sessions with real-time update streams.

use anyhow::{Context, Result};
use grammers_client::{Client, UpdatesConfiguration};
use grammers_mtsender::SenderPool;
use grammers_session::storages::SqliteSession;
use grammers_session::updates::UpdatesLike;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock as StdRwLock};
use tauri::AppHandle;
use tokio::sync::{mpsc, RwLock};
use tokio::task::JoinHandle;

use super::auth::UserInfo;
use super::updates;

/// Telegram client wrapper with metadata
pub struct TelegramClientWrapper {
    pub client: Client,
    pub account_id: String,
    pub phone: String,
    pub user_info: Option<UserInfo>,
    pub peers: Arc<RwLock<HashMap<i64, grammers_client::types::Peer>>>,
}

/// Per-account handles for background tasks
struct AccountTasks {
    /// Handle for the updates listener
    updates_handle: Option<JoinHandle<()>>,
    /// Shutdown signal sender
    shutdown_tx: Option<updates::ShutdownTx>,
}

/// Manager for multiple Telegram clients
pub struct TelegramClientManager {
    clients: Arc<RwLock<HashMap<String, Arc<TelegramClientWrapper>>>>,
    tasks: Arc<RwLock<HashMap<String, AccountTasks>>>,
    /// Stored updates receivers, to be consumed when starting updates handler
    updates_receivers: Arc<RwLock<HashMap<String, mpsc::UnboundedReceiver<UpdatesLike>>>>,
    pub sessions_dir: PathBuf,
    /// API credentials behind a std RwLock for in-place updates without replacing the manager
    credentials: StdRwLock<(i32, String)>,
}

impl TelegramClientManager {
    pub fn new(sessions_dir: PathBuf, api_id: i32, api_hash: String) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            updates_receivers: Arc::new(RwLock::new(HashMap::new())),
            sessions_dir,
            credentials: StdRwLock::new((api_id, api_hash)),
        }
    }

    /// Get the current API ID
    pub fn api_id(&self) -> i32 {
        self.credentials.read().unwrap().0
    }

    /// Get the current API Hash
    pub fn api_hash(&self) -> String {
        self.credentials.read().unwrap().1.clone()
    }

    /// Update API credentials in place (no manager replacement needed)
    pub fn update_credentials(&self, api_id: i32, api_hash: String) {
        *self.credentials.write().unwrap() = (api_id, api_hash);
    }

    /// Create a new client and SenderPool, store wrapper, return it.
    /// Does NOT start the updates handler yet (call `start_updates` after auth).
    pub async fn create_client(
        &self,
        account_id: String,
        phone: String,
    ) -> Result<Arc<TelegramClientWrapper>> {
        let session_path = self.sessions_dir.join(format!("{}.session", account_id));

        let session = Arc::new(
            SqliteSession::open(session_path.to_str().unwrap())
                .context("Failed to open/create session file")?,
        );

        let pool = SenderPool::new(session, self.api_id());
        let client = Client::new(&pool);

        // Destructure pool — runner drives the network, save updates receiver
        let SenderPool {
            runner,
            updates,
            handle: _,
        } = pool;

        tokio::spawn(runner.run());
        tracing::info!(account_id = %account_id, "SenderPool runner started");

        // Store updates receiver for later use by start_updates
        self.updates_receivers
            .write()
            .await
            .insert(account_id.clone(), updates);

        let wrapper = Arc::new(TelegramClientWrapper {
            client,
            account_id: account_id.clone(),
            phone,
            user_info: None,
            peers: Arc::new(RwLock::new(HashMap::new())),
        });

        self.clients.write().await.insert(account_id.clone(), wrapper.clone());
        Ok(wrapper)
    }

    /// Start the real-time updates handler for an account.
    /// Should be called after successful authentication.
    pub async fn start_updates(&self, account_id: &str, app: AppHandle) -> Result<()> {
        let wrapper = self
            .get_client(account_id)
            .await
            .context("Client not found")?;

        // Take the updates receiver (can only be consumed once)
        let updates_rx = self
            .updates_receivers
            .write()
            .await
            .remove(account_id)
            .context("Updates receiver not found (already consumed or never created)")?;

        // Create the UpdateStream from client + receiver
        let update_stream = wrapper.client.stream_updates(
            updates_rx,
            UpdatesConfiguration::default(),
        );

        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = updates::shutdown_channel();

        // Spawn updates handler with the UpdateStream
        let handle = updates::spawn_updates_handler(
            update_stream,
            account_id.to_string(),
            app,
            shutdown_rx,
        );

        // Store task handles
        self.tasks.write().await.insert(
            account_id.to_string(),
            AccountTasks {
                updates_handle: Some(handle),
                shutdown_tx: Some(shutdown_tx),
            },
        );

        tracing::info!(account_id = %account_id, "Updates handler started");
        Ok(())
    }

    /// Stop the updates handler for an account gracefully.
    /// Sends shutdown signal and waits for the task to finish (up to 5s).
    async fn stop_updates(&self, account_id: &str) {
        let task = self.tasks.write().await.remove(account_id);
        if let Some(account_tasks) = task {
            // Send shutdown signal first
            if let Some(tx) = account_tasks.shutdown_tx {
                let _ = tx.send(());
            }
            // Wait for graceful shutdown (avoids panic in UpdateStream::drop)
            if let Some(handle) = account_tasks.updates_handle {
                match tokio::time::timeout(std::time::Duration::from_secs(5), handle).await {
                    Ok(Ok(())) => {
                        tracing::info!(account_id = %account_id, "Updates handler stopped gracefully");
                    }
                    Ok(Err(e)) => {
                        tracing::warn!(account_id = %account_id, error = %e, "Updates handler panicked during shutdown");
                    }
                    Err(_) => {
                        tracing::warn!(account_id = %account_id, "Updates handler did not stop within timeout, detaching");
                    }
                }
            }
        }
    }

    pub async fn get_client(&self, account_id: &str) -> Option<Arc<TelegramClientWrapper>> {
        self.clients.read().await.get(account_id).cloned()
    }

    pub async fn remove_client(&self, account_id: &str) -> Result<()> {
        // Stop updates first
        self.stop_updates(account_id).await;

        // Clean up any unused updates receiver
        self.updates_receivers.write().await.remove(account_id);

        let mut clients = self.clients.write().await;
        if let Some(wrapper) = clients.remove(account_id) {
            wrapper.client.disconnect();

            let session_path = self.sessions_dir.join(format!("{}.session", account_id));
            if session_path.exists() {
                std::fs::remove_file(session_path)
                    .context("Failed to remove session file")?;
            }
        }

        Ok(())
    }

    pub async fn save_session(&self, _account_id: &str) -> Result<()> {
        // SqliteSession auto-saves
        Ok(())
    }

    pub async fn list_clients(&self) -> Vec<String> {
        self.clients.read().await.keys().cloned().collect()
    }

    /// Load existing sessions from disk.
    /// Updates handlers are NOT started here — call `start_updates` per account after setup.
    pub async fn load_existing_sessions(&self) -> Result<Vec<String>> {
        let mut loaded = Vec::new();

        if !self.sessions_dir.exists() {
            tracing::warn!(path = ?self.sessions_dir, "Sessions directory does not exist");
            return Ok(loaded);
        }

        let entries = std::fs::read_dir(&self.sessions_dir)
            .context("Failed to read sessions directory")?;

        for entry in entries {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("session") {
                continue;
            }

            let Some(account_id) = path.file_stem().and_then(|s| s.to_str()).map(String::from) else {
                continue;
            };

            tracing::info!(account_id = %account_id, "Loading session from disk");

            let session = Arc::new(
                SqliteSession::open(path.to_str().unwrap())
                    .context("Failed to open session file")?,
            );

            let pool = SenderPool::new(session, self.api_id());
            let client = Client::new(&pool);

            let SenderPool {
                runner,
                updates,
                handle: _,
            } = pool;

            tokio::spawn(runner.run());

            // Store updates receiver for later use
            self.updates_receivers
                .write()
                .await
                .insert(account_id.clone(), updates);

            let wrapper = Arc::new(TelegramClientWrapper {
                client,
                account_id: account_id.clone(),
                phone: String::new(),
                user_info: None,
                peers: Arc::new(RwLock::new(HashMap::new())),
            });

            self.clients.write().await.insert(account_id.clone(), wrapper);
            loaded.push(account_id);
        }

        tracing::info!(count = loaded.len(), "Sessions loaded from disk");
        Ok(loaded)
    }
}

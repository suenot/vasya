//! Storage abstraction layer
//!
//! Provides a unified async trait for data persistence,
//! with implementations for local SQLite and remote backend API.

pub mod types;
pub mod local;
pub mod remote;

pub use types::*;

use anyhow::Result;
use async_trait::async_trait;

/// Async storage trait — implemented by LocalStorage and RemoteStorage
#[async_trait]
pub trait DataStorage: Send + Sync {
    // ── Chats ──

    /// Save or update a chat
    async fn save_chat(&self, chat: &ChatRecord) -> Result<()>;

    /// Get all chats for an account, ordered by updated_at DESC
    async fn get_chats(&self, account_id: &str) -> Result<Vec<ChatRecord>>;

    // ── Folders ──

    /// Get all folders for an account, ordered by sort_order
    async fn get_folders(&self, account_id: &str) -> Result<Vec<FolderRecord>>;

    /// Save or update a folder for an account
    async fn save_folder(&self, account_id: &str, folder: &FolderRecord) -> Result<()>;

    /// Delete a folder by id and account_id
    async fn delete_folder(&self, account_id: &str, id: &str) -> Result<()>;

    // ── Tabs ──

    /// Get all tabs for an account, ordered by sort_order
    async fn get_tabs(&self, account_id: &str) -> Result<Vec<TabRecord>>;

    /// Replace all tabs for an account
    async fn save_tabs(&self, account_id: &str, tabs: &[TabRecord]) -> Result<()>;
}

/// Create a storage instance based on the mode
pub async fn create_storage(
    mode: &StorageMode,
    app_data_dir: &std::path::Path,
) -> Result<Box<dyn DataStorage>> {
    match mode {
        StorageMode::Local => {
            let db_path = app_data_dir.join("telegram.db");
            let storage = local::LocalStorage::open(&db_path)?;
            Ok(Box::new(storage))
        }
        StorageMode::Remote { url, api_key } => {
            let storage = remote::RemoteStorage::new(url.clone(), api_key.clone())?;
            Ok(Box::new(storage))
        }
    }
}

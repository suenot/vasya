//! Shared data types used by all storage implementations

use serde::{Deserialize, Serialize};

/// Chat record — unified across local and remote storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRecord {
    pub id: i64,
    pub account_id: String,
    pub chat_type: String,
    pub title: String,
    pub username: Option<String>,
    pub avatar_path: Option<String>,
    pub last_message: Option<String>,
    pub unread_count: i32,
}

/// Folder record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderRecord {
    pub id: String,
    pub name: String,
    pub included_chat_types: Vec<String>,
    pub excluded_chat_types: Vec<String>,
    pub included_chat_ids: Vec<i64>,
    pub excluded_chat_ids: Vec<i64>,
    pub sort_order: i32,
}

/// Tab record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabRecord {
    pub id: String,
    pub visible: bool,
    pub sort_order: i32,
}

/// Storage mode configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode")]
pub enum StorageMode {
    /// Local SQLite database (default)
    Local,
    /// Remote backend API
    Remote {
        /// Backend API base URL, e.g. "http://localhost:3000"
        url: String,
        /// Optional API key for Bearer token authentication
        api_key: Option<String>,
    },
}

impl Default for StorageMode {
    fn default() -> Self {
        StorageMode::Local
    }
}

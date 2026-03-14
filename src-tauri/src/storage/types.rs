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
    pub account_id: String,
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
    pub account_id: String,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_mode_local_serde_roundtrip() {
        let mode = StorageMode::Local;
        let json = serde_json::to_string(&mode).unwrap();
        let deserialized: StorageMode = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized, StorageMode::Local));
    }

    #[test]
    fn storage_mode_remote_serde_roundtrip() {
        let mode = StorageMode::Remote {
            url: "https://api.example.com".to_string(),
            api_key: Some("secret123".to_string()),
        };
        let json = serde_json::to_string(&mode).unwrap();
        let deserialized: StorageMode = serde_json::from_str(&json).unwrap();
        match deserialized {
            StorageMode::Remote { url, api_key } => {
                assert_eq!(url, "https://api.example.com");
                assert_eq!(api_key, Some("secret123".to_string()));
            }
            _ => panic!("Expected Remote variant"),
        }
    }

    #[test]
    fn storage_mode_remote_without_api_key() {
        let mode = StorageMode::Remote {
            url: "https://example.com".to_string(),
            api_key: None,
        };
        let json = serde_json::to_string(&mode).unwrap();
        let deserialized: StorageMode = serde_json::from_str(&json).unwrap();
        match deserialized {
            StorageMode::Remote { url, api_key } => {
                assert_eq!(url, "https://example.com");
                assert_eq!(api_key, None);
            }
            _ => panic!("Expected Remote variant"),
        }
    }

    #[test]
    fn storage_mode_default_is_local() {
        assert!(matches!(StorageMode::default(), StorageMode::Local));
    }

    #[test]
    fn storage_mode_deserialize_from_json_object() {
        let json = r#"{"mode":"Local"}"#;
        let mode: StorageMode = serde_json::from_str(json).unwrap();
        assert!(matches!(mode, StorageMode::Local));

        let json = r#"{"mode":"Remote","url":"https://x.com","api_key":null}"#;
        let mode: StorageMode = serde_json::from_str(json).unwrap();
        assert!(matches!(mode, StorageMode::Remote { .. }));
    }

    #[test]
    fn chat_record_serde_roundtrip() {
        let chat = ChatRecord {
            id: 12345,
            account_id: "acc-1".to_string(),
            chat_type: "group".to_string(),
            title: "Test Group".to_string(),
            username: Some("testgroup".to_string()),
            avatar_path: None,
            last_message: Some("Hello!".to_string()),
            unread_count: 5,
        };
        let json = serde_json::to_string(&chat).unwrap();
        let deserialized: ChatRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, 12345);
        assert_eq!(deserialized.account_id, "acc-1");
        assert_eq!(deserialized.chat_type, "group");
        assert_eq!(deserialized.title, "Test Group");
        assert_eq!(deserialized.username, Some("testgroup".to_string()));
        assert_eq!(deserialized.avatar_path, None);
        assert_eq!(deserialized.last_message, Some("Hello!".to_string()));
        assert_eq!(deserialized.unread_count, 5);
    }

    #[test]
    fn chat_record_with_all_none_fields() {
        let chat = ChatRecord {
            id: 1,
            account_id: "a".to_string(),
            chat_type: "user".to_string(),
            title: "T".to_string(),
            username: None,
            avatar_path: None,
            last_message: None,
            unread_count: 0,
        };
        let json = serde_json::to_string(&chat).unwrap();
        let deserialized: ChatRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.username, None);
        assert_eq!(deserialized.avatar_path, None);
        assert_eq!(deserialized.last_message, None);
    }

    #[test]
    fn folder_record_serde_roundtrip() {
        let folder = FolderRecord {
            id: "folder-1".to_string(),
            account_id: "acc-1".to_string(),
            name: "Work".to_string(),
            included_chat_types: vec!["group".to_string(), "channel".to_string()],
            excluded_chat_types: vec![],
            included_chat_ids: vec![100, 200],
            excluded_chat_ids: vec![300],
            sort_order: 2,
        };
        let json = serde_json::to_string(&folder).unwrap();
        let deserialized: FolderRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "folder-1");
        assert_eq!(deserialized.name, "Work");
        assert_eq!(deserialized.included_chat_types, vec!["group", "channel"]);
        assert!(deserialized.excluded_chat_types.is_empty());
        assert_eq!(deserialized.included_chat_ids, vec![100, 200]);
        assert_eq!(deserialized.excluded_chat_ids, vec![300]);
        assert_eq!(deserialized.sort_order, 2);
    }

    #[test]
    fn folder_record_empty_vecs() {
        let folder = FolderRecord {
            id: "f".to_string(),
            account_id: "acc-1".to_string(),
            name: "Empty".to_string(),
            included_chat_types: vec![],
            excluded_chat_types: vec![],
            included_chat_ids: vec![],
            excluded_chat_ids: vec![],
            sort_order: 0,
        };
        let json = serde_json::to_string(&folder).unwrap();
        let deserialized: FolderRecord = serde_json::from_str(&json).unwrap();
        assert!(deserialized.included_chat_types.is_empty());
        assert!(deserialized.included_chat_ids.is_empty());
    }

    #[test]
    fn tab_record_serde_roundtrip() {
        let tab = TabRecord {
            id: "all".to_string(),
            account_id: "acc-1".to_string(),
            visible: true,
            sort_order: 0,
        };
        let json = serde_json::to_string(&tab).unwrap();
        let deserialized: TabRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "all");
        assert!(deserialized.visible);
        assert_eq!(deserialized.sort_order, 0);
    }

    #[test]
    fn tab_record_invisible() {
        let tab = TabRecord {
            id: "hidden".to_string(),
            account_id: "acc-1".to_string(),
            visible: false,
            sort_order: 5,
        };
        let json = serde_json::to_string(&tab).unwrap();
        let deserialized: TabRecord = serde_json::from_str(&json).unwrap();
        assert!(!deserialized.visible);
        assert_eq!(deserialized.sort_order, 5);
    }
}

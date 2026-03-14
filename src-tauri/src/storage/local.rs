//! Local SQLite storage implementation
//!
//! Wraps the existing Database module to implement the DataStorage trait.

use anyhow::{Context, Result};
use async_trait::async_trait;
use sqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::{ChatRecord, DataStorage, FolderRecord, TabRecord};

/// Local SQLite storage — wraps the existing database logic
pub struct LocalStorage {
    conn: Arc<Mutex<Connection>>,
}

unsafe impl Send for LocalStorage {}
unsafe impl Sync for LocalStorage {}

impl LocalStorage {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = sqlite::open(path).context("Failed to open database")?;
        let storage = LocalStorage {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.run_migrations()?;
        Ok(storage)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let migration_sql = include_str!("../../migrations/V1__initial_schema.sql");
        conn.execute(migration_sql).context("Failed to run migrations")?;

        // V2: Add account_id to folders and tabs for multi-tenancy
        let _ = conn.execute("ALTER TABLE chat_folders ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");
        let _ = conn.execute("ALTER TABLE chat_tabs ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");

        // Create unique indexes for composite key (id, account_id) — needed for ON CONFLICT
        let _ = conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_folders_id_account ON chat_folders(id, account_id)");
        let _ = conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_tabs_id_account ON chat_tabs(id, account_id)");

        Ok(())
    }

    fn now_unix() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }
}

#[async_trait]
impl DataStorage for LocalStorage {
    async fn save_chat(&self, chat: &ChatRecord) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let chat = chat.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let now = LocalStorage::now_unix();

            let query = "
                INSERT INTO chats (
                    id, account_id, type, title, username, avatar_path,
                    last_message, unread_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id, account_id) DO UPDATE SET
                    type = excluded.type,
                    title = excluded.title,
                    username = excluded.username,
                    avatar_path = excluded.avatar_path,
                    last_message = excluded.last_message,
                    unread_count = excluded.unread_count,
                    updated_at = excluded.updated_at
            ";

            let mut stmt = conn.prepare(query).context("Failed to prepare chat insert")?;
            stmt.bind((1, chat.id)).context("bind chat_id")?;
            stmt.bind((2, chat.account_id.as_str())).context("bind account_id")?;
            stmt.bind((3, chat.chat_type.as_str())).context("bind type")?;
            stmt.bind((4, chat.title.as_str())).context("bind title")?;

            match &chat.username {
                Some(u) => stmt.bind((5, u.as_str())).context("bind username")?,
                None => stmt.bind((5, ())).context("bind username")?,
            };
            match &chat.avatar_path {
                Some(ap) => stmt.bind((6, ap.as_str())).context("bind avatar_path")?,
                None => stmt.bind((6, ())).context("bind avatar_path")?,
            };
            match &chat.last_message {
                Some(lm) => stmt.bind((7, lm.as_str())).context("bind last_message")?,
                None => stmt.bind((7, ())).context("bind last_message")?,
            };

            stmt.bind((8, chat.unread_count as i64)).context("bind unread_count")?;
            stmt.bind((9, now)).context("bind created_at")?;
            stmt.bind((10, now)).context("bind updated_at")?;
            stmt.next().context("execute chat insert")?;

            Ok(())
        })
        .await
        .context("spawn_blocking panicked")?
    }

    async fn get_chats(&self, account_id: &str) -> Result<Vec<ChatRecord>> {
        let conn = Arc::clone(&self.conn);
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let query = "
                SELECT id, account_id, type, title, username, avatar_path,
                       last_message, unread_count, updated_at
                FROM chats
                WHERE account_id = ?
                ORDER BY updated_at DESC
            ";

            let mut stmt = conn.prepare(query).context("Failed to prepare chats query")?;
            stmt.bind((1, account_id.as_str())).context("bind account_id")?;

            let mut chats = Vec::new();
            while let Ok(sqlite::State::Row) = stmt.next() {
                chats.push(ChatRecord {
                    id: stmt.read::<i64, _>("id").unwrap(),
                    account_id: stmt.read::<String, _>("account_id").unwrap(),
                    chat_type: stmt.read::<String, _>("type").unwrap(),
                    title: stmt.read::<String, _>("title").unwrap(),
                    username: stmt.read::<Option<String>, _>("username").unwrap(),
                    avatar_path: stmt.read::<Option<String>, _>("avatar_path").unwrap(),
                    last_message: stmt.read::<Option<String>, _>("last_message").unwrap(),
                    unread_count: stmt.read::<i64, _>("unread_count").unwrap() as i32,
                });
            }

            Ok(chats)
        })
        .await
        .context("spawn_blocking panicked")?
    }

    async fn get_folders(&self, account_id: &str) -> Result<Vec<FolderRecord>> {
        let conn = Arc::clone(&self.conn);
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "SELECT id, name, included_chat_types, excluded_chat_types, \
                 included_chat_ids, excluded_chat_ids, sort_order \
                 FROM chat_folders WHERE account_id = ? ORDER BY sort_order"
            ).context("prepare")?;
            stmt.bind((1, account_id.as_str())).unwrap();

            let mut result = Vec::new();
            while let Ok(sqlite::State::Row) = stmt.next() {
                result.push(FolderRecord {
                    id: stmt.read::<String, _>("id").unwrap(),
                    name: stmt.read::<String, _>("name").unwrap(),
                    included_chat_types: serde_json::from_str(
                        &stmt.read::<String, _>("included_chat_types").unwrap(),
                    ).unwrap_or_default(),
                    excluded_chat_types: serde_json::from_str(
                        &stmt.read::<String, _>("excluded_chat_types").unwrap(),
                    ).unwrap_or_default(),
                    included_chat_ids: serde_json::from_str(
                        &stmt.read::<String, _>("included_chat_ids").unwrap(),
                    ).unwrap_or_default(),
                    excluded_chat_ids: serde_json::from_str(
                        &stmt.read::<String, _>("excluded_chat_ids").unwrap(),
                    ).unwrap_or_default(),
                    sort_order: stmt.read::<i64, _>("sort_order").unwrap() as i32,
                });
            }
            Ok(result)
        })
        .await
        .context("spawn_blocking")?
    }

    async fn save_folder(&self, account_id: &str, folder: &FolderRecord) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let folder = folder.clone();
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let now = LocalStorage::now_unix();
            let mut stmt = conn.prepare(
                "INSERT INTO chat_folders (id, account_id, name, included_chat_types, excluded_chat_types, \
                 included_chat_ids, excluded_chat_ids, sort_order, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(id, account_id) DO UPDATE SET \
                 name=excluded.name, included_chat_types=excluded.included_chat_types, \
                 excluded_chat_types=excluded.excluded_chat_types, \
                 included_chat_ids=excluded.included_chat_ids, \
                 excluded_chat_ids=excluded.excluded_chat_ids, \
                 sort_order=excluded.sort_order, updated_at=excluded.updated_at"
            ).context("prepare")?;

            stmt.bind((1, folder.id.as_str())).unwrap();
            stmt.bind((2, account_id.as_str())).unwrap();
            stmt.bind((3, folder.name.as_str())).unwrap();
            stmt.bind((4, serde_json::to_string(&folder.included_chat_types).unwrap().as_str())).unwrap();
            stmt.bind((5, serde_json::to_string(&folder.excluded_chat_types).unwrap().as_str())).unwrap();
            stmt.bind((6, serde_json::to_string(&folder.included_chat_ids).unwrap().as_str())).unwrap();
            stmt.bind((7, serde_json::to_string(&folder.excluded_chat_ids).unwrap().as_str())).unwrap();
            stmt.bind((8, folder.sort_order as i64)).unwrap();
            stmt.bind((9, now)).unwrap();
            stmt.bind((10, now)).unwrap();
            stmt.next().context("execute")?;
            Ok(())
        })
        .await
        .context("spawn_blocking")?
    }

    async fn delete_folder(&self, account_id: &str, id: &str) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let id = id.to_string();
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare("DELETE FROM chat_folders WHERE id = ? AND account_id = ?").context("prepare")?;
            stmt.bind((1, id.as_str())).unwrap();
            stmt.bind((2, account_id.as_str())).unwrap();
            stmt.next().context("execute")?;
            let mut stmt2 = conn.prepare("DELETE FROM chat_tabs WHERE id = ? AND account_id = ?").context("prepare")?;
            stmt2.bind((1, id.as_str())).unwrap();
            stmt2.bind((2, account_id.as_str())).unwrap();
            stmt2.next().context("execute")?;
            Ok(())
        })
        .await
        .context("spawn_blocking")?
    }

    async fn get_tabs(&self, account_id: &str) -> Result<Vec<TabRecord>> {
        let conn = Arc::clone(&self.conn);
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "SELECT id, visible, sort_order FROM chat_tabs WHERE account_id = ? ORDER BY sort_order"
            ).context("prepare")?;
            stmt.bind((1, account_id.as_str())).unwrap();

            let mut result = Vec::new();
            while let Ok(sqlite::State::Row) = stmt.next() {
                result.push(TabRecord {
                    id: stmt.read::<String, _>("id").unwrap(),
                    visible: stmt.read::<i64, _>("visible").unwrap() != 0,
                    sort_order: stmt.read::<i64, _>("sort_order").unwrap() as i32,
                });
            }
            Ok(result)
        })
        .await
        .context("spawn_blocking")?
    }

    async fn save_tabs(&self, account_id: &str, tabs: &[TabRecord]) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let tabs = tabs.to_vec();
        let account_id = account_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut del_stmt = conn.prepare("DELETE FROM chat_tabs WHERE account_id = ?").context("clear")?;
            del_stmt.bind((1, account_id.as_str())).unwrap();
            del_stmt.next().context("execute delete")?;
            for tab in &tabs {
                let mut stmt = conn.prepare(
                    "INSERT INTO chat_tabs (id, account_id, visible, sort_order) VALUES (?, ?, ?, ?)"
                ).context("prepare")?;
                stmt.bind((1, tab.id.as_str())).unwrap();
                stmt.bind((2, account_id.as_str())).unwrap();
                stmt.bind((3, if tab.visible { 1i64 } else { 0i64 })).unwrap();
                stmt.bind((4, tab.sort_order as i64)).unwrap();
                stmt.next().context("execute")?;
            }
            Ok(())
        })
        .await
        .context("spawn_blocking")?
    }
}

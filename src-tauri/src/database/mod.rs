//! Database module for SQLite operations
//!
//! Uses tokio::task::spawn_blocking for all DB operations
//! to avoid blocking the async runtime.

use anyhow::{Context, Result};
use sqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Database wrapper — thread-safe via std::sync::Mutex,
/// but all public methods run via spawn_blocking to avoid starving tokio.
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

// Safety: Connection is Send (sqlite crate guarantees this)
unsafe impl Send for Database {}
unsafe impl Sync for Database {}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = sqlite::open(path).context("Failed to open database")?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations_sync()?;
        Ok(db)
    }

    /// Run migrations synchronously (called once at startup)
    fn run_migrations_sync(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let migration_sql = include_str!("../../migrations/V1__initial_schema.sql");
        conn.execute(migration_sql).context("Failed to run migrations")?;
        Ok(())
    }

    /// Save or update a chat in the database (async-safe)
    pub async fn save_chat_async(
        &self,
        account_id: String,
        chat_id: i64,
        chat_type: String,
        title: String,
        username: Option<String>,
        avatar_path: Option<String>,
        last_message: Option<String>,
        unread_count: i32,
    ) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

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

            stmt.bind((1, chat_id)).context("bind chat_id")?;
            stmt.bind((2, account_id.as_str())).context("bind account_id")?;
            stmt.bind((3, chat_type.as_str())).context("bind type")?;
            stmt.bind((4, title.as_str())).context("bind title")?;

            match &username {
                Some(u) => stmt.bind((5, u.as_str())).context("bind username")?,
                None => stmt.bind((5, ())).context("bind username")?,
            };
            match &avatar_path {
                Some(ap) => stmt.bind((6, ap.as_str())).context("bind avatar_path")?,
                None => stmt.bind((6, ())).context("bind avatar_path")?,
            };
            match &last_message {
                Some(lm) => stmt.bind((7, lm.as_str())).context("bind last_message")?,
                None => stmt.bind((7, ())).context("bind last_message")?,
            };

            stmt.bind((8, unread_count as i64)).context("bind unread_count")?;
            stmt.bind((9, now)).context("bind created_at")?;
            stmt.bind((10, now)).context("bind updated_at")?;
            stmt.next().context("execute chat insert")?;

            Ok(())
        })
        .await
        .context("spawn_blocking panicked")?
    }

    /// Synchronous save_chat for backward compatibility (used from sync contexts)
    pub fn save_chat(
        &self,
        account_id: &str,
        chat_id: i64,
        chat_type: &str,
        title: &str,
        username: Option<&str>,
        avatar_path: Option<&str>,
        last_message: Option<&str>,
        unread_count: i32,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

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

        stmt.bind((1, chat_id)).context("bind chat_id")?;
        stmt.bind((2, account_id)).context("bind account_id")?;
        stmt.bind((3, chat_type)).context("bind type")?;
        stmt.bind((4, title)).context("bind title")?;

        match username {
            Some(u) => stmt.bind((5, u)).context("bind username")?,
            None => stmt.bind((5, ())).context("bind username")?,
        };
        match avatar_path {
            Some(ap) => stmt.bind((6, ap)).context("bind avatar_path")?,
            None => stmt.bind((6, ())).context("bind avatar_path")?,
        };
        match last_message {
            Some(lm) => stmt.bind((7, lm)).context("bind last_message")?,
            None => stmt.bind((7, ())).context("bind last_message")?,
        };

        stmt.bind((8, unread_count as i64)).context("bind unread_count")?;
        stmt.bind((9, now)).context("bind created_at")?;
        stmt.bind((10, now)).context("bind updated_at")?;
        stmt.next().context("execute chat insert")?;

        Ok(())
    }

    /// Get all chats for an account (async-safe)
    pub async fn get_chats_async(&self, account_id: String) -> Result<Vec<ChatRecord>> {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            Self::query_chats(&conn, &account_id)
        })
        .await
        .context("spawn_blocking panicked")?
    }

    /// Synchronous get_chats for backward compatibility
    pub fn get_chats(&self, account_id: &str) -> Result<Vec<ChatRecord>> {
        let conn = self.conn.lock().unwrap();
        Self::query_chats(&conn, account_id)
    }

    fn query_chats(conn: &Connection, account_id: &str) -> Result<Vec<ChatRecord>> {
        let query = "
            SELECT id, account_id, type, title, username, avatar_path,
                   last_message, unread_count, updated_at
            FROM chats
            WHERE account_id = ?
            ORDER BY updated_at DESC
        ";

        let mut stmt = conn.prepare(query).context("Failed to prepare chats query")?;
        stmt.bind((1, account_id)).context("bind account_id")?;

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
    }

    // ── Folders ──

    pub async fn get_folders(&self) -> Result<Vec<FolderRecord>> {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, name, included_chat_types, excluded_chat_types, included_chat_ids, excluded_chat_ids, sort_order FROM chat_folders ORDER BY sort_order").context("prepare")?;
            let mut result = Vec::new();
            while let Ok(sqlite::State::Row) = stmt.next() {
                result.push(FolderRecord {
                    id: stmt.read::<String, _>("id").unwrap(),
                    name: stmt.read::<String, _>("name").unwrap(),
                    included_chat_types: serde_json::from_str(&stmt.read::<String, _>("included_chat_types").unwrap()).unwrap_or_default(),
                    excluded_chat_types: serde_json::from_str(&stmt.read::<String, _>("excluded_chat_types").unwrap()).unwrap_or_default(),
                    included_chat_ids: serde_json::from_str(&stmt.read::<String, _>("included_chat_ids").unwrap()).unwrap_or_default(),
                    excluded_chat_ids: serde_json::from_str(&stmt.read::<String, _>("excluded_chat_ids").unwrap()).unwrap_or_default(),
                    sort_order: stmt.read::<i64, _>("sort_order").unwrap() as i32,
                });
            }
            Ok(result)
        }).await.context("spawn_blocking")?
    }

    pub async fn save_folder(&self, folder: &FolderRecord) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let folder = folder.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
            let mut stmt = conn.prepare("INSERT INTO chat_folders (id, name, included_chat_types, excluded_chat_types, included_chat_ids, excluded_chat_ids, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, included_chat_types=excluded.included_chat_types, excluded_chat_types=excluded.excluded_chat_types, included_chat_ids=excluded.included_chat_ids, excluded_chat_ids=excluded.excluded_chat_ids, sort_order=excluded.sort_order, updated_at=excluded.updated_at").context("prepare")?;
            stmt.bind((1, folder.id.as_str())).unwrap();
            stmt.bind((2, folder.name.as_str())).unwrap();
            stmt.bind((3, serde_json::to_string(&folder.included_chat_types).unwrap().as_str())).unwrap();
            stmt.bind((4, serde_json::to_string(&folder.excluded_chat_types).unwrap().as_str())).unwrap();
            stmt.bind((5, serde_json::to_string(&folder.included_chat_ids).unwrap().as_str())).unwrap();
            stmt.bind((6, serde_json::to_string(&folder.excluded_chat_ids).unwrap().as_str())).unwrap();
            stmt.bind((7, folder.sort_order as i64)).unwrap();
            stmt.bind((8, now)).unwrap();
            stmt.bind((9, now)).unwrap();
            stmt.next().context("execute")?;
            Ok(())
        }).await.context("spawn_blocking")?
    }

    pub async fn delete_folder(&self, id: &str) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare("DELETE FROM chat_folders WHERE id = ?").context("prepare")?;
            stmt.bind((1, id.as_str())).unwrap();
            stmt.next().context("execute")?;
            let mut stmt2 = conn.prepare("DELETE FROM chat_tabs WHERE id = ?").context("prepare")?;
            stmt2.bind((1, id.as_str())).unwrap();
            stmt2.next().context("execute")?;
            Ok(())
        }).await.context("spawn_blocking")?
    }

    // ── Tabs ──

    pub async fn get_tabs(&self) -> Result<Vec<TabRecord>> {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, visible, sort_order FROM chat_tabs ORDER BY sort_order").context("prepare")?;
            let mut result = Vec::new();
            while let Ok(sqlite::State::Row) = stmt.next() {
                result.push(TabRecord {
                    id: stmt.read::<String, _>("id").unwrap(),
                    visible: stmt.read::<i64, _>("visible").unwrap() != 0,
                    sort_order: stmt.read::<i64, _>("sort_order").unwrap() as i32,
                });
            }
            Ok(result)
        }).await.context("spawn_blocking")?
    }

    pub async fn save_tabs(&self, tabs: &[TabRecord]) -> Result<()> {
        let conn = Arc::clone(&self.conn);
        let tabs = tabs.to_vec();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            conn.execute("DELETE FROM chat_tabs").context("clear")?;
            for tab in &tabs {
                let mut stmt = conn.prepare("INSERT INTO chat_tabs (id, visible, sort_order) VALUES (?, ?, ?)").context("prepare")?;
                stmt.bind((1, tab.id.as_str())).unwrap();
                stmt.bind((2, if tab.visible { 1i64 } else { 0i64 })).unwrap();
                stmt.bind((3, tab.sort_order as i64)).unwrap();
                stmt.next().context("execute")?;
            }
            Ok(())
        }).await.context("spawn_blocking")?
    }
}

/// Folder record
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TabRecord {
    pub id: String,
    pub visible: bool,
    pub sort_order: i32,
}

/// Chat record from database
#[derive(Debug, Clone)]
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

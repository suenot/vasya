//! Database module for SQLite operations

use anyhow::{Context, Result};
use sqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Database wrapper
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open or create database at the specified path
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = sqlite::open(path)
            .context("Failed to open database")?;

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Run migrations
        db.run_migrations()?;

        Ok(db)
    }

    /// Run database migrations
    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Read and execute migration SQL
        let migration_sql = include_str!("../../migrations/V1__initial_schema.sql");

        conn.execute(migration_sql)
            .context("Failed to run migrations")?;

        Ok(())
    }

    /// Get a reference to the connection
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    /// Save or update a chat in the database
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

        let mut stmt = conn.prepare(query)
            .context("Failed to prepare chat insert statement")?;

        stmt.bind((1, chat_id))
            .context("Failed to bind chat_id")?;
        stmt.bind((2, account_id))
            .context("Failed to bind account_id")?;
        stmt.bind((3, chat_type))
            .context("Failed to bind type")?;
        stmt.bind((4, title))
            .context("Failed to bind title")?;

        if let Some(u) = username {
            stmt.bind((5, u)).context("Failed to bind username")?;
        } else {
            stmt.bind((5, ())).context("Failed to bind username")?;
        }

        if let Some(ap) = avatar_path {
            stmt.bind((6, ap)).context("Failed to bind avatar_path")?;
        } else {
            stmt.bind((6, ())).context("Failed to bind avatar_path")?;
        }

        if let Some(lm) = last_message {
            stmt.bind((7, lm)).context("Failed to bind last_message")?;
        } else {
            stmt.bind((7, ())).context("Failed to bind last_message")?;
        }

        stmt.bind((8, unread_count as i64))
            .context("Failed to bind unread_count")?;
        stmt.bind((9, now))
            .context("Failed to bind created_at")?;
        stmt.bind((10, now))
            .context("Failed to bind updated_at")?;

        stmt.next()
            .context("Failed to execute chat insert")?;

        Ok(())
    }

    /// Get all chats for an account
    pub fn get_chats(&self, account_id: &str) -> Result<Vec<ChatRecord>> {
        let conn = self.conn.lock().unwrap();

        let query = "
            SELECT id, account_id, type, title, username, avatar_path,
                   last_message, unread_count, updated_at
            FROM chats
            WHERE account_id = ?
            ORDER BY updated_at DESC
        ";

        let mut stmt = conn.prepare(query)
            .context("Failed to prepare chats query")?;

        stmt.bind((1, account_id))
            .context("Failed to bind account_id")?;

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

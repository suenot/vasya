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
}

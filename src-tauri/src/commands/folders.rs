//! Folder/tab Tauri commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;
use crate::database::{FolderRecord, TabRecord};

#[tauri::command]
pub async fn get_folders(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<FolderRecord>, String> {
    let s = state.read().await;
    let db = s.db.as_ref().ok_or("DB not initialized")?;
    db.get_folders().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_folder(
    folder: FolderRecord,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let db = s.db.as_ref().ok_or("DB not initialized")?;
    db.save_folder(&folder).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_folder(
    id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let db = s.db.as_ref().ok_or("DB not initialized")?;
    db.delete_folder(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tabs(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<TabRecord>, String> {
    let s = state.read().await;
    let db = s.db.as_ref().ok_or("DB not initialized")?;
    db.get_tabs().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_tabs(
    tabs: Vec<TabRecord>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let db = s.db.as_ref().ok_or("DB not initialized")?;
    db.save_tabs(&tabs).await.map_err(|e| e.to_string())
}

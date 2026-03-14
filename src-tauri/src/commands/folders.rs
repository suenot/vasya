//! Folder/tab Tauri commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;
use crate::storage::{FolderRecord, TabRecord};

#[tauri::command]
pub async fn get_folders(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<FolderRecord>, String> {
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.get_folders(&account_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_folder(
    account_id: String,
    folder: FolderRecord,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.save_folder(&account_id, &folder).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_folder(
    account_id: String,
    id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.delete_folder(&account_id, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tabs(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<TabRecord>, String> {
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.get_tabs(&account_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_tabs(
    account_id: String,
    tabs: Vec<TabRecord>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.save_tabs(&account_id, &tabs).await.map_err(|e| e.to_string())
}

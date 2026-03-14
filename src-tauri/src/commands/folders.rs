//! Folder/tab Tauri commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;
use crate::storage::{FolderRecord, TabRecord};

/// Maximum allowed sort_order value to prevent overflow / abuse
const MAX_SORT_ORDER: i32 = 10_000;

/// Validate that account_id contains only safe ASCII alphanumeric chars, hyphens, and underscores.
fn validate_account_id(account_id: &str) -> Result<(), String> {
    if account_id.is_empty() {
        return Err("account_id must not be empty".to_string());
    }
    if account_id.len() > 128 {
        return Err("account_id too long".to_string());
    }
    if !account_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("account_id contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate that a sort_order value is within the allowed range.
fn validate_sort_order(sort_order: i32) -> Result<(), String> {
    if sort_order < 0 || sort_order > MAX_SORT_ORDER {
        return Err(format!("sort_order must be between 0 and {}", MAX_SORT_ORDER));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_folders(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<FolderRecord>, String> {
    validate_account_id(&account_id)?;
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
    validate_account_id(&account_id)?;
    validate_sort_order(folder.sort_order)?;
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
    validate_account_id(&account_id)?;
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.delete_folder(&account_id, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tabs(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<TabRecord>, String> {
    validate_account_id(&account_id)?;
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
    validate_account_id(&account_id)?;
    for tab in &tabs {
        validate_sort_order(tab.sort_order)?;
    }
    let s = state.read().await;
    let storage = s.storage.as_ref().ok_or("Storage not initialized")?;
    storage.save_tabs(&account_id, &tabs).await.map_err(|e| e.to_string())
}

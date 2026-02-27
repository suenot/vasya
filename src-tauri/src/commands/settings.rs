//! Settings commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;

/// Check if API credentials are already configured in the backend (e.g. from bundled .env)
#[tauri::command]
pub async fn get_api_credentials(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(i32, String), String> {
    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let api_id = client_manager.api_id();
    let api_hash = client_manager.api_hash();
    Ok((api_id, api_hash))
}

/// Update API credentials in place (no manager replacement to avoid UpdateStream drop panics)
#[tauri::command]
pub async fn update_api_credentials(
    api_id: i32,
    api_hash: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!("Updating API credentials: api_id={}", api_id);

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    client_manager.update_credentials(api_id, api_hash);

    tracing::info!("API credentials updated successfully");
    Ok(())
}

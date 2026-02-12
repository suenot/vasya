//! Settings commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;

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

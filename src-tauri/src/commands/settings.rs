//! Settings commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::AppState;

/// Update API credentials
#[tauri::command]
pub async fn update_api_credentials(
    api_id: i32,
    api_hash: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!("Updating API credentials: api_id={}", api_id);

    let state_guard = state.read().await;

    if let Some(client_manager) = &state_guard.client_manager {
        // Recreate client manager with new credentials
        let sessions_dir = client_manager.sessions_dir.clone();

        drop(state_guard); // Release read lock

        let new_manager = crate::telegram::TelegramClientManager::new(
            sessions_dir,
            api_id,
            api_hash,
        );

        // Update state with new manager
        let mut state_mut = state.write().await;
        state_mut.client_manager = Some(Arc::new(new_manager));

        tracing::info!("API credentials updated successfully");
        Ok(())
    } else {
        Err("Client manager not initialized".to_string())
    }
}

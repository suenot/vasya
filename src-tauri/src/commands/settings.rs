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
        // Clone what we need before dropping the read lock
        let old_manager = Arc::clone(client_manager);
        let sessions_dir = client_manager.sessions_dir.clone();

        drop(state_guard); // Release read lock

        // Clean up old clients to stop orphaned runner tasks and update handlers
        let old_clients = old_manager.list_clients().await;
        for account_id in &old_clients {
            if let Err(e) = old_manager.remove_client(account_id).await {
                tracing::warn!(account_id = %account_id, error = %e, "Failed to cleanup old client");
            }
        }

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

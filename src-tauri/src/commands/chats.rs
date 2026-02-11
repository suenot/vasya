//! Chat commands for retrieving dialogs and messages

use std::sync::Arc;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_client::types::Peer;
use grammers_session::defs::PeerRef;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: i64,
    pub title: String,
    pub username: Option<String>,
    pub unread_count: i32,
    pub chat_type: String, // "user", "group", "channel"
    pub last_message: Option<String>,
    pub avatar_path: Option<String>,
}

/// Get cached chats from database
#[tauri::command]
pub async fn get_cached_chats(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Chat>, String> {
    let state_guard = state.read().await;
    let db = Arc::clone(
        state_guard
            .db
            .as_ref()
            .ok_or("Database not initialized")?,
    );
    drop(state_guard);

    let records = db.get_chats_async(account_id.clone()).await
        .map_err(|e| format!("Failed to get chats from database: {}", e))?;

    let chats = records
        .into_iter()
        .map(|r| Chat {
            id: r.id,
            title: r.title,
            username: r.username,
            unread_count: r.unread_count,
            chat_type: r.chat_type,
            last_message: r.last_message,
            avatar_path: r.avatar_path,
        })
        .collect();

    Ok(chats)
}

/// Start loading chats with progressive updates via events
#[tauri::command]
pub async fn start_loading_chats(
    account_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::debug!("start_loading_chats called");
    tracing::debug!(account_id = %account_id, "Loading chats");

    let state_guard = state.read().await;
    let client_manager = Arc::clone(
        state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?,
    );
    let db = state_guard.db.as_ref().map(Arc::clone);

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    // Drop the state guard before the async loop to avoid holding the lock across awaits
    drop(state_guard);

    tracing::debug!("Fetching dialogs with progressive updates");

    // Create avatars directory using app data dir for reliable absolute paths
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let avatars_dir = app_data_dir.join("media").join("avatars");
    tokio::fs::create_dir_all(&avatars_dir).await
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    // Get all dialogs (chats) and emit each one immediately
    let mut dialogs = wrapper.client.iter_dialogs();
    let mut count = 0;

    while let Some(dialog) = dialogs.next().await.map_err(|e| format!("Failed to get dialogs: {}", e))? {
        let peer = &dialog.peer;

        let chat_type = match peer {
            Peer::User(_) => "user",
            Peer::Group(_) => "group",
            Peer::Channel(_) => "channel",
        };

        let title = peer.name().unwrap_or("Unknown").to_string();
        let username = match peer {
            Peer::User(u) => u.username().map(|s| s.to_string()),
            Peer::Channel(c) => c.username().map(|s| s.to_string()),
            _ => None,
        };

        let chat_id = PeerRef::from(peer).id.bot_api_dialog_id();

        // Update peer cache for fast retrieval
        {
            let mut peers = wrapper.peers.write().await;
            peers.insert(chat_id, peer.clone());
        }

        // Try to download avatar
        let avatar_path = download_avatar_for_peer(&wrapper.client, peer, chat_id, &avatars_dir).await;

        // Get last message text from dialog
        let last_message_text = dialog.last_message
            .as_ref()
            .map(|msg| {
                let text = msg.text();
                if text.chars().count() > 100 {
                    let truncated: String = text.chars().take(100).collect();
                    format!("{}...", truncated)
                } else {
                    text.to_string()
                }
            });

        let chat = Chat {
            id: chat_id,
            title: title.clone(),
            username: username.clone(),
            unread_count: 0, // TODO: get actual unread count
            chat_type: chat_type.to_string(),
            last_message: last_message_text.clone(),
            avatar_path: avatar_path.clone(),
        };

        // Save to database
        if let Some(ref db) = db {
            if let Err(e) = db.save_chat_async(
                account_id.clone(),
                chat_id,
                chat_type.to_string(),
                title.clone(),
                username.clone(),
                avatar_path.clone(),
                last_message_text.clone(),
                0,    // unread_count
            ).await {
                tracing::warn!(chat_id = chat_id, error = %e, "Failed to save chat to database");
            } else {
                tracing::debug!(chat_id = chat_id, "Saved chat to database");
            }
        }

        // EMIT IMMEDIATELY
        app.emit("chat-loaded", &chat)
            .map_err(|e| format!("Failed to emit chat event: {}", e))?;

        count += 1;
    }

    app.emit("chats-loading-complete", count)
        .map_err(|e| format!("Failed to emit completion event: {}", e))?;

    Ok(())
}

/// Legacy: Get all chats at once
#[tauri::command]
pub async fn get_chats(
    account_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Chat>, String> {
    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let avatars_dir = app_data_dir.join("media").join("avatars");
    tokio::fs::create_dir_all(&avatars_dir).await
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    let mut dialogs = wrapper.client.iter_dialogs();
    let mut chats = Vec::new();

    while let Some(dialog) = dialogs.next().await.map_err(|e| format!("Failed to get dialogs: {}", e))? {
        let peer = &dialog.peer;
        let chat_type = match peer {
            Peer::User(_) => "user",
            Peer::Group(_) => "group",
            Peer::Channel(_) => "channel",
        };

        let title = peer.name().unwrap_or("Unknown").to_string();
        let username = match peer {
            Peer::User(u) => u.username().map(|s| s.to_string()),
            Peer::Channel(c) => c.username().map(|s| s.to_string()),
            _ => None,
        };

        let chat_id = PeerRef::from(peer).id.bot_api_dialog_id();
        let avatar_path = download_avatar_for_peer(&wrapper.client, peer, chat_id, &avatars_dir).await;

        chats.push(Chat {
            id: chat_id,
            title: title.clone(),
            username,
            unread_count: 0,
            chat_type: chat_type.to_string(),
            last_message: None,
            avatar_path,
        });
    }

    Ok(chats)
}

/// Helper function to download avatar for a peer.
/// The `avatars_dir` must be an absolute path (derived from app_data_dir).
async fn download_avatar_for_peer(
    client: &grammers_client::Client,
    peer: &Peer,
    chat_id: i64,
    avatars_dir: &PathBuf,
) -> Option<String> {
    let file_path = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));

    // Check if avatar already exists (avatars_dir is already absolute)
    if file_path.exists() {
        tracing::debug!(chat_id = chat_id, "Avatar already cached");
        return Some(file_path.to_string_lossy().to_string());
    }

    // Try to get and download the first profile photo
    let mut photos = client.iter_profile_photos(peer);

    match photos.next().await {
        Ok(Some(photo)) => {
            // Download the photo
            match client.download_media(&photo, &file_path).await {
                Ok(()) => {
                    tracing::debug!(chat_id = chat_id, "Avatar downloaded");
                    Some(file_path.to_string_lossy().to_string())
                }
                Err(e) => {
                    tracing::warn!(chat_id = chat_id, error = %e, "Failed to download avatar");
                    None
                }
            }
        }
        Ok(None) => {
            tracing::debug!(chat_id = chat_id, "No profile photo available");
            None
        }
        Err(e) => {
            tracing::warn!(chat_id = chat_id, error = %e, "Error getting profile photos");
            None
        }
    }
}

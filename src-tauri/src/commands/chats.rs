//! Chat commands for retrieving dialogs and messages

use std::sync::Arc;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{RwLock, Semaphore};
use serde::{Deserialize, Serialize};
use grammers_client::types::Peer;
use grammers_session::defs::PeerRef;

use crate::AppState;
use super::flood_wait::with_flood_wait_retry;

/// Max concurrent avatar downloads to avoid FLOOD_WAIT
const MAX_CONCURRENT_AVATAR_DOWNLOADS: usize = 3;

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
    pub is_forum: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatAvatarUpdatedEvent {
    pub chat_id: i64,
    pub avatar_path: String,
}

/// Get cached chats from database
#[tauri::command]
pub async fn get_cached_chats(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Chat>, String> {
    let state_guard = state.read().await;
    let storage = Arc::clone(
        state_guard
            .storage
            .as_ref()
            .ok_or("Storage not initialized")?,
    );
    drop(state_guard);

    let records = storage.get_chats(&account_id).await
        .map_err(|e| format!("Failed to get chats from storage: {}", e))?;

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
            is_forum: r.is_forum,
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
    let storage = state_guard.storage.as_ref().map(Arc::clone);

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

    // Semaphore to limit concurrent avatar downloads
    let avatar_semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_AVATAR_DOWNLOADS));

    // Get all dialogs (chats) and emit each one IMMEDIATELY.
    // Avatar downloads and DB saves run in background tasks.
    let mut dialogs = wrapper.client.iter_dialogs();
    let mut count = 0;

    while let Some(dialog) = dialogs.next().await.map_err(|e| format!("Failed to get dialogs: {}", e))? {
        let peer = &dialog.peer;

        let (chat_type, is_forum) = match peer {
            Peer::User(_) => ("user", false),
            Peer::Group(g) => {
                // Megagroups (supergroups) with forum flag enabled
                let forum = match &g.raw {
                    grammers_tl_types::enums::Chat::Channel(ch) => ch.forum,
                    _ => false,
                };
                ("group", forum)
            },
            Peer::Channel(c) => ("channel", c.raw.forum),
        };

        let title = peer.name().unwrap_or("Unknown").to_string();
        let username = match peer {
            Peer::User(u) => u.username().map(|s| s.to_string()),
            Peer::Channel(c) => c.username().map(|s| s.to_string()),
            Peer::Group(g) => g.username().map(|s| s.to_string()),
        };

        let chat_id = PeerRef::from(peer).id.bot_api_dialog_id();

        // Update peer cache for fast retrieval
        {
            let mut peers = wrapper.peers.write().await;
            peers.insert(chat_id, peer.clone());
        }

        // Quick filesystem check for cached avatar (no network, ~0ms)
        let avatar_file = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));
        let cached_avatar = if avatar_file.exists() {
            Some(avatar_file.to_string_lossy().to_string())
        } else {
            None
        };

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
            avatar_path: cached_avatar.clone(),
            is_forum,
        };

        // EMIT IMMEDIATELY — no waiting for avatar download or DB save
        app.emit("chat-loaded", &chat)
            .map_err(|e| format!("Failed to emit chat event: {}", e))?;

        count += 1;

        // Background: avatar download + DB save (fire-and-forget)
        {
            let client = wrapper.client.clone();
            let peer = peer.clone();
            let app = app.clone();
            let storage = storage.clone();
            let account_id = account_id.clone();
            let avatars_dir = avatars_dir.clone();
            let chat_type = chat_type.to_string();
            let title = title.clone();
            let username = username.clone();
            let last_message_text = last_message_text.clone();
            let cached_avatar = cached_avatar.clone();
            let semaphore = Arc::clone(&avatar_semaphore);
            let is_forum = is_forum;

            tokio::spawn(async move {
                // Download avatar if not cached (rate-limited by semaphore)
                let avatar_path = if cached_avatar.is_none() {
                    let path = download_avatar_for_peer(&client, &peer, chat_id, &avatars_dir, &semaphore).await;
                    if let Some(ref p) = path {
                        let _ = app.emit("chat-avatar-updated", ChatAvatarUpdatedEvent {
                            chat_id,
                            avatar_path: p.clone(),
                        });
                    }
                    path
                } else {
                    cached_avatar
                };

                // Save to storage
                if let Some(ref storage) = storage {
                    let record = crate::storage::ChatRecord {
                        id: chat_id,
                        account_id: account_id.clone(),
                        chat_type: chat_type.clone(),
                        title: title.clone(),
                        username: username.clone(),
                        avatar_path: avatar_path.clone(),
                        last_message: last_message_text.clone(),
                        unread_count: 0,
                        is_forum,
                    };
                    if let Err(e) = storage.save_chat(&record).await {
                        tracing::warn!(chat_id = chat_id, error = %e, "Failed to save chat to storage");
                    }
                }
            });
        }
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

    let semaphore = Semaphore::new(MAX_CONCURRENT_AVATAR_DOWNLOADS);

    let mut dialogs = wrapper.client.iter_dialogs();
    let mut chats = Vec::new();

    while let Some(dialog) = dialogs.next().await.map_err(|e| format!("Failed to get dialogs: {}", e))? {
        let peer = &dialog.peer;
        let (chat_type, is_forum) = match peer {
            Peer::User(_) => ("user", false),
            Peer::Group(g) => {
                let forum = match &g.raw {
                    grammers_tl_types::enums::Chat::Channel(ch) => ch.forum,
                    _ => false,
                };
                ("group", forum)
            },
            Peer::Channel(c) => ("channel", c.raw.forum),
        };

        let title = peer.name().unwrap_or("Unknown").to_string();
        let username = match peer {
            Peer::User(u) => u.username().map(|s| s.to_string()),
            Peer::Channel(c) => c.username().map(|s| s.to_string()),
            Peer::Group(g) => g.username().map(|s| s.to_string()),
        };

        let chat_id = PeerRef::from(peer).id.bot_api_dialog_id();
        let avatar_path = download_avatar_for_peer(&wrapper.client, peer, chat_id, &avatars_dir, &semaphore).await;

        chats.push(Chat {
            id: chat_id,
            title: title.clone(),
            username,
            unread_count: 0,
            chat_type: chat_type.to_string(),
            last_message: None,
            avatar_path,
            is_forum,
        });
    }

    Ok(chats)
}

/// Delete chat history and leave
#[tauri::command]
pub async fn delete_and_leave_chat(
    account_id: String,
    chat_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!(account_id = %account_id, chat_id = chat_id, "Delete and leave chat");

    let wrapper = {
        let state_guard = state.read().await;
        let client_manager = state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?;
        client_manager
            .get_client(&account_id)
            .await
            .ok_or("Client not found for this account")?
    };

    // Look up peer from cache
    let peer = {
        let peers = wrapper.peers.read().await;
        peers.get(&chat_id).cloned()
            .ok_or("Chat not found in peer cache. Try reopening the chat list.")?
    };

    // Delete history and leave — delete_dialog handles all peer types:
    // channels/megagroups -> LeaveChannel, groups -> DeleteChatUser, users -> DeleteHistory
    wrapper.client.delete_dialog(&peer)
        .await
        .map_err(|e| format!("Failed to delete and leave chat: {}", e))?;

    tracing::info!(account_id = %account_id, chat_id = chat_id, "Successfully deleted and left chat");
    Ok(())
}

/// Helper function to download avatar for a peer.
/// The `avatars_dir` must be an absolute path (derived from app_data_dir).
/// Uses a semaphore to limit concurrent downloads and handles FLOOD_WAIT.
async fn download_avatar_for_peer(
    client: &grammers_client::Client,
    peer: &Peer,
    chat_id: i64,
    avatars_dir: &PathBuf,
    semaphore: &Semaphore,
) -> Option<String> {
    let file_path = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));

    // Check if avatar already exists (avatars_dir is already absolute)
    if file_path.exists() {
        tracing::debug!(chat_id = chat_id, "Avatar already cached");
        return Some(file_path.to_string_lossy().to_string());
    }

    // Acquire semaphore permit to limit concurrent downloads
    let _permit = semaphore.acquire().await.ok()?;

    // Try to get and download the first profile photo (with FLOOD_WAIT retry)
    let photo_result = with_flood_wait_retry(|| async {
        let mut photos = client.iter_profile_photos(peer);
        photos.next().await
    }).await;

    match photo_result {
        Ok(Some(photo)) => {
            // Download the photo (with FLOOD_WAIT retry)
            let download_result = with_flood_wait_retry(|| async {
                client.download_media(&photo, &file_path).await
            }).await;

            match download_result {
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

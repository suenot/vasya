//! Media download commands

use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use grammers_client::types::Message as GrammersMessage;
use grammers_session::defs::PeerRef;

use crate::AppState;
use crate::commands::messages::MediaInfo;

/// Download media from a message
#[tauri::command]
pub async fn download_media(
    account_id: String,
    chat_id: i64,
    message_id: i32,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<Vec<MediaInfo>>, String> {
    tracing::info!("===== DOWNLOAD_MEDIA CALLED =====");
    tracing::info!("Parameters: account_id={}, chat_id={}, message_id={}", account_id, chat_id, message_id);

    tracing::debug!("Acquiring state lock...");
    let state_guard = state.read().await;

    tracing::debug!("Getting client manager...");
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or_else(|| {
            tracing::error!("Client manager not initialized");
            "Client manager not initialized".to_string()
        })?;

    tracing::debug!("Getting client for account: {}", account_id);
    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or_else(|| {
            tracing::error!("Client not found for account: {}", account_id);
            "Client not found for this account".to_string()
        })?;

    tracing::info!("Client found, iterating dialogs to find chat {}", chat_id);
    // Get chat by ID
    let mut dialogs = wrapper.client.iter_dialogs();
    let mut target_chat = None;

    while let Some(dialog) = dialogs.next().await
        .map_err(|e| {
            tracing::error!("Failed to iterate dialogs: {}", e);
            format!("Failed to iterate dialogs: {}", e)
        })? {
        let peer = &dialog.peer;
        let id = PeerRef::from(peer).id.bot_api_dialog_id();

        if id == chat_id {
            tracing::info!("Found target chat: {}", chat_id);
            target_chat = Some(peer.clone());
            break;
        }
    }

    let chat = target_chat.ok_or_else(|| {
        tracing::error!("Chat {} not found", chat_id);
        "Chat not found".to_string()
    })?;

    tracing::info!("Searching for message {} in chat {}", message_id, chat_id);
    // Find the specific message using offset_id
    // Start from the message we're looking for and get a few messages around it
    let mut messages_iter = wrapper.client.iter_messages(&chat)
        .offset_id(message_id + 1)  // Start from one message after our target
        .limit(100);  // Get up to 100 messages to find ours

    let mut target_message: Option<GrammersMessage> = None;
    let mut checked_count = 0;

    while let Some(msg) = messages_iter.next().await
        .map_err(|e| {
            tracing::error!("Failed to get messages: {}", e);
            format!("Failed to get messages: {}", e)
        })? {

        checked_count += 1;
        tracing::debug!("Checking message ID: {} (looking for {}, checked: {})", msg.id(), message_id, checked_count);
        if msg.id() == message_id {
            tracing::info!("Found target message: {}", message_id);
            target_message = Some(msg);
            break;
        }
    }

    let message = target_message.ok_or_else(|| {
        tracing::error!("Message {} not found in chat {} after checking {} messages", message_id, chat_id, checked_count);
        format!("Message {} not found in chat {}", message_id, chat_id)
    })?;

    // Check if message has media
    let media = match message.media() {
        Some(m) => m,
        None => {
            tracing::warn!("Message {} has no media", message_id);
            return Ok(None);
        }
    };

    // Skip WebPage media - these are link previews, not downloadable files
    if matches!(media, grammers_client::types::Media::WebPage(_)) {
        tracing::info!("Message {} has WebPage media (link preview), skipping download", message_id);
        return Ok(None);
    }

    tracing::info!("Message {} has media, proceeding to download", message_id);

    // Create media directory in current directory
    let media_dir = PathBuf::from("media").join(format!("chat_{}", chat_id.abs()));
    tracing::info!("Creating media directory: {:?}", media_dir);

    tokio::fs::create_dir_all(&media_dir).await
        .map_err(|e| {
            tracing::error!("Failed to create media directory {:?}: {}", media_dir, e);
            format!("Failed to create media directory: {}", e)
        })?;

    // Generate filename with proper extension based on media type
    let timestamp = chrono::Utc::now().timestamp();

    // Determine file extension from media type (we already have media from above check)
    let extension = match &media {
        grammers_client::types::Media::Photo(_) => {
            tracing::debug!("Media type: Photo");
            "jpg".to_string()
        }
        grammers_client::types::Media::Document(doc) => {
            if let Some(mime) = doc.mime_type() {
                let mime_str = mime.to_string();
                tracing::debug!("Media type: Document, MIME: {}", mime_str);
                if mime_str.starts_with("video/") {
                    "mp4".to_string()
                } else if mime_str.starts_with("audio/") {
                    "mp3".to_string()
                } else if mime_str.starts_with("image/") {
                    mime_str.split('/').nth(1).unwrap_or("dat").to_string()
                } else {
                    "dat".to_string()
                }
            } else {
                tracing::debug!("Media type: Document, no MIME type");
                "dat".to_string()
            }
        }
        _ => {
            tracing::debug!("Media type: Other");
            "dat".to_string()
        }
    };

    let file_path = media_dir.join(format!("media_{}_{}.{}", message_id, timestamp, extension));
    tracing::info!("File path (relative): {:?}", file_path);

    // Convert to absolute path
    let absolute_path = std::env::current_dir()
        .map_err(|e| {
            tracing::error!("Failed to get current directory: {}", e);
            format!("Failed to get current directory: {}", e)
        })?
        .join(&file_path);

    tracing::info!("File path (absolute): {:?}", absolute_path);

    // Download media using Client::download_media for better control
    tracing::info!("Starting media download using Client API...");

    // media is already available from the earlier check
    match wrapper.client.download_media(&media, &file_path).await {
        Ok(()) => {
            tracing::info!("✓ Media downloaded successfully to: {:?}", absolute_path);

            // Verify file exists and get its size
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) => {
                    tracing::info!("✓ File verified on disk, size: {} bytes", metadata.len());
                }
                Err(e) => {
                    tracing::error!("✗ Downloaded file not found on disk: {}", e);
                    return Err(format!("File not found after download: {}", e));
                }
            }

            // Get media info with absolute path (for Tauri convertFileSrc)
            let media_info = extract_downloaded_media_info(&media, absolute_path.to_string_lossy().to_string());

            tracing::info!("Returning media info: {:?}", media_info);
            tracing::info!("===== DOWNLOAD_MEDIA SUCCESS =====");
            Ok(Some(vec![media_info]))
        }
        Err(e) => {
            tracing::error!("✗ Failed to download media: {}", e);
            tracing::error!("Error details: {:?}", e);
            tracing::error!("Media type: {:?}", media);
            tracing::error!("===== DOWNLOAD_MEDIA FAILED =====");
            Err(format!("Failed to download media: {}", e))
        }
    }
}

/// Download chat/user profile photo
#[tauri::command]
pub async fn download_chat_photo(
    account_id: String,
    chat_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<String>, String> {
    tracing::info!("===== DOWNLOAD_CHAT_PHOTO CALLED =====");
    tracing::info!("Parameters: account_id={}, chat_id={}", account_id, chat_id);

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    tracing::info!("Finding chat {}", chat_id);
    // Find the chat
    let mut dialogs = wrapper.client.iter_dialogs();
    let mut target_peer = None;

    while let Some(dialog) = dialogs.next().await
        .map_err(|e| format!("Failed to iterate dialogs: {}", e))? {
        let peer = &dialog.peer;
        let id = PeerRef::from(peer).id.bot_api_dialog_id();

        if id == chat_id {
            tracing::info!("Found target chat: {}", chat_id);
            target_peer = Some(peer.clone());
            break;
        }
    }

    let peer = target_peer.ok_or("Chat not found")?;

    // Try to get profile photo
    tracing::info!("Downloading profile photo for chat {}", chat_id);

    // Create avatars directory
    let avatars_dir = PathBuf::from("media").join("avatars");
    tokio::fs::create_dir_all(&avatars_dir).await
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    let file_path = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));

    // Get absolute path for Tauri
    let absolute_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?
        .join(&file_path);

    // Get and download the first profile photo
    let mut photos = wrapper.client.iter_profile_photos(&peer);

    match photos.next().await {
        Ok(Some(photo)) => {
            // Download the photo
            match wrapper.client.download_media(&photo, &file_path).await {
                Ok(()) => {
                    tracing::info!("✓ Profile photo downloaded successfully to: {:?}", absolute_path);

                    // Verify file exists
                    match tokio::fs::metadata(&absolute_path).await {
                        Ok(metadata) => {
                            tracing::info!("✓ File verified, size: {} bytes", metadata.len());
                            Ok(Some(absolute_path.to_string_lossy().to_string()))
                        }
                        Err(e) => {
                            tracing::error!("✗ Downloaded file not found: {}", e);
                            Ok(None)
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to download profile photo: {}", e);
                    Ok(None)
                }
            }
        }
        Ok(None) => {
            tracing::info!("No profile photo available for chat {}", chat_id);
            Ok(None)
        }
        Err(e) => {
            tracing::warn!("Error getting profile photos: {}", e);
            Ok(None)
        }
    }
}

fn extract_downloaded_media_info(
    media: &grammers_client::types::Media,
    file_path: String,
) -> MediaInfo {
    use grammers_client::types::Media;

    match media {
        Media::Photo(_) => MediaInfo {
            media_type: "photo".to_string(),
            file_path: Some(file_path),
            file_name: None,
            file_size: None,
            mime_type: Some("image/jpeg".to_string()),
        },
        Media::Document(doc) => {
            let media_type = if let Some(mime) = doc.mime_type() {
                if mime.starts_with("video/") {
                    "video"
                } else if mime.starts_with("audio/") {
                    if mime == "audio/ogg" {
                        "voice"
                    } else {
                        "audio"
                    }
                } else if mime.starts_with("image/") {
                    "sticker"
                } else {
                    "document"
                }
            } else {
                "document"
            };

            MediaInfo {
                media_type: media_type.to_string(),
                file_path: Some(file_path),
                file_name: None,
                file_size: Some(doc.size() as u64),
                mime_type: doc.mime_type().map(|s| s.to_string()),
            }
        }
        _ => MediaInfo {
            media_type: "other".to_string(),
            file_path: Some(file_path),
            file_name: None,
            file_size: None,
            mime_type: None,
        },
    }
}

//! Media download commands

use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use grammers_client::types::Message as GrammersMessage;

use crate::AppState;
use crate::commands::messages::MediaInfo;
use super::peer_resolve::resolve_peer;

/// Download media from a message
#[tauri::command]
pub async fn download_media(
    account_id: String,
    chat_id: i64,
    message_id: i32,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<Vec<MediaInfo>>, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        message_id = message_id,
        "Download media requested"
    );

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    let chat = resolve_peer(&wrapper, chat_id).await?;

    // Find the specific message
    let mut messages_iter = wrapper
        .client
        .iter_messages(&chat)
        .offset_id(message_id + 1)
        .limit(50);

    let mut target_message: Option<GrammersMessage> = None;

    while let Some(msg) = messages_iter
        .next()
        .await
        .map_err(|e| format!("Failed to get messages: {}", e))?
    {
        if msg.id() == message_id {
            target_message = Some(msg);
            break;
        }
    }

    let message = target_message.ok_or_else(|| {
        format!("Message {} not found in chat {}", message_id, chat_id)
    })?;

    let media = match message.media() {
        Some(m) => m,
        None => return Ok(None),
    };

    // Skip WebPage — link previews, not downloadable files
    if matches!(media, grammers_client::types::Media::WebPage(_)) {
        return Ok(None);
    }

    // Create media directory
    let media_dir = PathBuf::from("media").join(format!("chat_{}", chat_id.abs()));
    tokio::fs::create_dir_all(&media_dir)
        .await
        .map_err(|e| format!("Failed to create media directory: {}", e))?;

    let extension = media_extension(&media);
    let timestamp = chrono::Utc::now().timestamp();
    let file_path = media_dir.join(format!("media_{}_{}.{}", message_id, timestamp, extension));

    let absolute_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get cwd: {}", e))?
        .join(&file_path);

    match wrapper.client.download_media(&media, &file_path).await {
        Ok(()) => {
            // Verify file exists
            tokio::fs::metadata(&absolute_path)
                .await
                .map_err(|e| format!("File not found after download: {}", e))?;

            let media_info = build_media_info(&media, absolute_path.to_string_lossy().to_string());
            tracing::info!(message_id = message_id, "Media downloaded successfully");
            Ok(Some(vec![media_info]))
        }
        Err(e) => {
            tracing::error!(error = %e, message_id = message_id, "Failed to download media");
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
    tracing::info!(account_id = %account_id, chat_id = chat_id, "Download chat photo");

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    let peer = resolve_peer(&wrapper, chat_id).await?;

    let avatars_dir = PathBuf::from("media").join("avatars");
    tokio::fs::create_dir_all(&avatars_dir)
        .await
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    let file_path = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));
    let absolute_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get cwd: {}", e))?
        .join(&file_path);

    // Return cached avatar if exists
    if absolute_path.exists() {
        return Ok(Some(absolute_path.to_string_lossy().to_string()));
    }

    let mut photos = wrapper.client.iter_profile_photos(&peer);
    match photos.next().await {
        Ok(Some(photo)) => match wrapper.client.download_media(&photo, &file_path).await {
            Ok(()) => {
                tokio::fs::metadata(&absolute_path)
                    .await
                    .map_err(|_| "Downloaded file not found".to_string())?;
                Ok(Some(absolute_path.to_string_lossy().to_string()))
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to download profile photo");
                Ok(None)
            }
        },
        Ok(None) => Ok(None),
        Err(e) => {
            tracing::warn!(error = %e, "Error getting profile photos");
            Ok(None)
        }
    }
}

/// Get file extension from media type
fn media_extension(media: &grammers_client::types::Media) -> String {
    match media {
        grammers_client::types::Media::Photo(_) => "jpg".to_string(),
        grammers_client::types::Media::Document(doc) => {
            doc.mime_type()
                .map(|mime| {
                    if mime.starts_with("video/") {
                        "mp4"
                    } else if mime.starts_with("audio/") {
                        "mp3"
                    } else if mime.starts_with("image/") {
                        mime.split('/').nth(1).unwrap_or("dat")
                    } else {
                        "dat"
                    }
                })
                .unwrap_or("dat")
                .to_string()
        }
        _ => "dat".to_string(),
    }
}

/// Build MediaInfo with file path for downloaded media
fn build_media_info(media: &grammers_client::types::Media, file_path: String) -> MediaInfo {
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
            let media_type = doc
                .mime_type()
                .map(|mime| {
                    if mime.starts_with("video/") {
                        "video"
                    } else if mime.starts_with("audio/") {
                        if mime == "audio/ogg" { "voice" } else { "audio" }
                    } else if mime.starts_with("image/") {
                        "sticker"
                    } else {
                        "document"
                    }
                })
                .unwrap_or("document");

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

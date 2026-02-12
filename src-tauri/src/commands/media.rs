//! Media download commands

use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;
use grammers_client::types::Message as GrammersMessage;

use crate::AppState;
use crate::commands::messages::MediaInfo;
use super::media_types::classify_media_type;
use super::peer_resolve::resolve_peer;
use super::flood_wait::with_flood_wait_retry;

/// Download media from a message
#[tauri::command]
pub async fn download_media(
    account_id: String,
    chat_id: i64,
    message_id: i32,
    app: AppHandle,
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

    // Create media directory using app data dir for reliable absolute paths
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let media_dir = app_data_dir.join("media").join(format!("chat_{}", chat_id.abs()));
    tokio::fs::create_dir_all(&media_dir)
        .await
        .map_err(|e| format!("Failed to create media directory: {}", e))?;

    let extension = media_extension(&media);
    let timestamp = chrono::Utc::now().timestamp();
    let file_path = media_dir.join(format!("media_{}_{}.{}", message_id, timestamp, extension));

    // Download with FLOOD_WAIT retry
    let download_result = with_flood_wait_retry(|| async {
        wrapper.client.download_media(&media, &file_path).await
    }).await;

    match download_result {
        Ok(()) => {
            // Verify file exists
            tokio::fs::metadata(&file_path)
                .await
                .map_err(|e| format!("File not found after download: {}", e))?;

            let media_info = build_media_info(&media, file_path.to_string_lossy().to_string());
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
    app: AppHandle,
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

    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let avatars_dir = app_data_dir.join("media").join("avatars");
    tokio::fs::create_dir_all(&avatars_dir)
        .await
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    let file_path = avatars_dir.join(format!("chat_{}.jpg", chat_id.abs()));

    // Return cached avatar if exists
    if file_path.exists() {
        return Ok(Some(file_path.to_string_lossy().to_string()));
    }

    // Get profile photo with FLOOD_WAIT retry
    let photo_result = with_flood_wait_retry(|| async {
        let mut photos = wrapper.client.iter_profile_photos(&peer);
        photos.next().await
    }).await;

    match photo_result {
        Ok(Some(photo)) => {
            let download_result = with_flood_wait_retry(|| async {
                wrapper.client.download_media(&photo, &file_path).await
            }).await;

            match download_result {
                Ok(()) => {
                    tokio::fs::metadata(&file_path)
                        .await
                        .map_err(|_| "Downloaded file not found".to_string())?;
                    Ok(Some(file_path.to_string_lossy().to_string()))
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to download profile photo");
                    Ok(None)
                }
            }
        }
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

    let media_type = classify_media_type(media).to_string();
    let (file_size, mime_type) = match media {
        Media::Document(doc) => (
            Some(doc.size() as u64),
            doc.mime_type().map(|s| s.to_string()),
        ),
        Media::Photo(_) => (None, Some("image/jpeg".to_string())),
        _ => (None, None),
    };

    MediaInfo {
        media_type,
        file_path: Some(file_path),
        file_name: None,
        file_size,
        mime_type,
    }
}

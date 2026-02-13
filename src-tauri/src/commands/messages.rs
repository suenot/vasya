//! Message commands for retrieving and sending messages

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_client::types::Message as GrammersMessage;
use grammers_session::defs::PeerRef;

use crate::AppState;
use grammers_client::types::Media;
use super::media_types::classify_media_type;
use super::peer_resolve::resolve_peer;

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaInfo {
    pub media_type: String,
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<u64>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: i32,
    pub chat_id: i64,
    pub from_user_id: Option<i64>,
    pub text: Option<String>,
    pub date: i64,
    pub is_outgoing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<MediaInfo>>,
}

/// Extract media information from a message
fn extract_media_info(msg: &GrammersMessage) -> Option<Vec<MediaInfo>> {
    msg.media().map(|media| {
        let media_type = classify_media_type(&media).to_string();
        let (file_size, mime_type) = match &media {
            Media::Document(doc) => (
                Some(doc.size() as u64),
                doc.mime_type().map(|s| s.to_string()),
            ),
            Media::Photo(_) => (None, Some("image/jpeg".to_string())),
            _ => (None, None),
        };
        vec![MediaInfo {
            media_type,
            file_path: None,
            file_name: None,
            file_size,
            mime_type,
        }]
    })
}

/// Get messages from a chat
#[tauri::command]
pub async fn get_messages(
    account_id: String,
    chat_id: i64,
    offset_id: Option<i32>,
    limit: Option<usize>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Message>, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        offset_id = ?offset_id,
        "Getting messages"
    );

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
    }; // state_guard dropped here

    let chat = resolve_peer(&wrapper, chat_id).await?;

    let limit = limit.unwrap_or(50);
    let mut messages_iter = wrapper.client.iter_messages(&chat);

    if let Some(offset) = offset_id {
        messages_iter = messages_iter.offset_id(offset);
    }

    let mut messages = Vec::with_capacity(limit);
    let mut count = 0;

    while let Some(msg) = messages_iter
        .next()
        .await
        .map_err(|e| format!("Failed to get messages: {}", e))?
    {
        messages.push(Message {
            id: msg.id(),
            chat_id,
            from_user_id: msg.sender().map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
            text: if msg.text().is_empty() {
                None
            } else {
                Some(msg.text().to_string())
            },
            date: msg.date().timestamp(),
            is_outgoing: msg.outgoing(),
            media: extract_media_info(&msg),
        });

        count += 1;
        if count >= limit {
            break;
        }
    }

    tracing::info!(count = messages.len(), chat_id = chat_id, "Messages loaded");
    Ok(messages)
}

/// Search messages in a chat
#[tauri::command]
pub async fn search_messages(
    account_id: String,
    chat_id: i64,
    query: String,
    limit: Option<usize>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Message>, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        query = %query,
        "Searching messages"
    );

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

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
    }; // state_guard dropped here

    let chat = resolve_peer(&wrapper, chat_id).await?;

    let limit = limit.unwrap_or(50);
    let mut search_iter = wrapper.client.search_messages(&chat).query(&query);

    let mut messages = Vec::with_capacity(limit);
    let mut count = 0;

    while let Some(msg) = search_iter
        .next()
        .await
        .map_err(|e| format!("Failed to search messages: {}", e))?
    {
        messages.push(Message {
            id: msg.id(),
            chat_id,
            from_user_id: msg.sender().map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
            text: if msg.text().is_empty() {
                None
            } else {
                Some(msg.text().to_string())
            },
            date: msg.date().timestamp(),
            is_outgoing: msg.outgoing(),
            media: extract_media_info(&msg),
        });

        count += 1;
        if count >= limit {
            break;
        }
    }

    tracing::info!(count = messages.len(), chat_id = chat_id, query = %query, "Search results");
    Ok(messages)
}

/// Send a message to a chat
#[tauri::command]
pub async fn send_message(
    account_id: String,
    chat_id: i64,
    text: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Message, String> {
    tracing::info!(account_id = %account_id, chat_id = chat_id, "Sending message");

    if text.trim().is_empty() {
        return Err("Message text cannot be empty".to_string());
    }

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
    }; // state_guard dropped here

    let chat = resolve_peer(&wrapper, chat_id).await?;

    let sent_message = wrapper
        .client
        .send_message(&chat, text.clone())
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    tracing::info!(msg_id = sent_message.id(), "Message sent");

    Ok(Message {
        id: sent_message.id(),
        chat_id,
        from_user_id: sent_message
            .sender()
            .map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
        text: Some(text),
        date: sent_message.date().timestamp(),
        is_outgoing: true,
        media: extract_media_info(&sent_message),
    })
}
/// Send media to a chat
#[tauri::command]
pub async fn send_media(
    account_id: String,
    chat_id: i64,
    media_bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
    caption: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Message, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        file_name = %file_name,
        "Sending media"
    );

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

    let chat = resolve_peer(&wrapper, chat_id).await?;

    // Preserve file extension so grammers can detect media type
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let tmp_path = std::env::temp_dir().join(format!("upload_{}.{}", uuid::Uuid::new_v4(), ext));
    tokio::fs::write(&tmp_path, &media_bytes)
        .await
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Upload the file
    let uploaded_file = wrapper
        .client
        .upload_file(&tmp_path)
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))?;

    // For images: let grammers auto-detect from extension → sends as inputMediaUploadedPhoto
    // For other files: set mime_type explicitly → sends as inputMediaUploadedDocument
    let mut input_msg = grammers_client::InputMessage::new()
        .text(caption.unwrap_or_default())
        .file(uploaded_file);
    if !mime_type.starts_with("image/") {
        input_msg = input_msg.mime_type(&mime_type);
    }

    let sent_message = wrapper
        .client
        .send_message(&chat, input_msg)
        .await
        .map_err(|e| format!("Failed to send media: {}", e))?;

    tracing::info!(msg_id = sent_message.id(), "Media sent");

    // Save a local copy so the frontend can display it immediately (no re-download needed)
    let local_file_path = save_sent_media_locally(&app, chat_id, sent_message.id(), ext, &tmp_path).await;

    // Clean up temp file
    let _ = tokio::fs::remove_file(&tmp_path).await;

    // Build media info with local file path
    let media = sent_message.media().map(|m| {
        let media_type = classify_media_type(&m).to_string();
        let (file_size, mime_type_val) = match &m {
            Media::Document(doc) => (
                Some(doc.size() as u64),
                doc.mime_type().map(|s| s.to_string()),
            ),
            Media::Photo(_) => (None, Some("image/jpeg".to_string())),
            _ => (None, None),
        };
        vec![MediaInfo {
            media_type,
            file_path: local_file_path.clone(),
            file_name: None,
            file_size,
            mime_type: mime_type_val,
        }]
    });

    Ok(Message {
        id: sent_message.id(),
        chat_id,
        from_user_id: sent_message
            .sender()
            .map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
        text: if sent_message.text().is_empty() { None } else { Some(sent_message.text().to_string()) },
        date: sent_message.date().timestamp(),
        is_outgoing: true,
        media,
    })
}

/// Save sent media to the local media directory so it can be displayed without re-downloading.
async fn save_sent_media_locally(
    app: &tauri::AppHandle,
    chat_id: i64,
    message_id: i32,
    ext: &str,
    tmp_path: &std::path::Path,
) -> Option<String> {
    use tauri::Manager;
    let app_data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return None,
    };
    let media_dir = app_data_dir.join("media").join(format!("chat_{}", chat_id.unsigned_abs()));
    if tokio::fs::create_dir_all(&media_dir).await.is_err() {
        return None;
    }
    let timestamp = chrono::Utc::now().timestamp();
    let dest = media_dir.join(format!("media_{}_{}.{}", message_id, timestamp, ext));
    if tokio::fs::copy(tmp_path, &dest).await.is_ok() {
        Some(dest.to_string_lossy().to_string())
    } else {
        None
    }
}

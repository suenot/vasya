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

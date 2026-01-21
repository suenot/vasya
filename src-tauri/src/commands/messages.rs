//! Message commands for retrieving and sending messages

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_client::types::Message as GrammersMessage;
use grammers_session::defs::PeerRef;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: i32,
    pub chat_id: i64,
    pub from_user_id: Option<i64>,
    pub text: Option<String>,
    pub date: i64,
    pub is_outgoing: bool,
}

/// Get messages from a chat
#[tauri::command]
pub async fn get_messages(
    account_id: String,
    chat_id: i64,
    offset_id: Option<i32>, // For pagination: load messages older than this ID
    limit: Option<usize>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Message>, String> {
    eprintln!("===== GET_MESSAGES CALLED =====");
    eprintln!("Account ID: {}, Chat ID: {}, Offset: {:?}, Limit: {:?}", 
        account_id, chat_id, offset_id, limit);

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    eprintln!("Fetching messages from chat {}...", chat_id);

    // Get chat by ID
    let mut dialogs = wrapper.client.iter_dialogs();
    let mut target_chat = None;

    while let Some(dialog) = dialogs.next().await
        .map_err(|e| format!("Failed to iterate dialogs: {}", e))? {
        let peer = &dialog.peer;
        let id = PeerRef::from(peer).id.bot_api_dialog_id();

        if id == chat_id {
            target_chat = Some(peer.clone());
            break;
        }
    }

    let chat = target_chat.ok_or("Chat not found")?;

    // Get messages
    let limit = limit.unwrap_or(50);
    let mut messages_iter = wrapper.client.iter_messages(&chat);

    // If offset_id is provided, skip to that position
    if let Some(offset) = offset_id {
        messages_iter = messages_iter.offset_id(offset);
    }

    let mut messages = Vec::new();
    let mut count = 0;

    while let Some(msg) = messages_iter.next().await
        .map_err(|e| format!("Failed to get messages: {}", e))? {
        
        messages.push(Message {
            id: msg.id(),
            chat_id,
            from_user_id: msg.sender().map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
            text: if msg.text().is_empty() { None } else { Some(msg.text().to_string()) },
            date: msg.date().timestamp(),
            is_outgoing: msg.outgoing(),
        });

        count += 1;
        if count >= limit {
            break;
        }
    }

    eprintln!("Loaded {} messages from chat {}", messages.len(), chat_id);
    Ok(messages)
}

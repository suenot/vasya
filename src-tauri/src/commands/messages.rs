//! Message commands for retrieving and sending messages

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_client::types::Message as GrammersMessage;
use grammers_session::defs::PeerRef;

use crate::AppState;
use grammers_client::types::Media;

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
        let media_info = match media {
            // WebPage previews - mark as webpage type so frontend can display link preview
            Media::WebPage(_) => MediaInfo {
                media_type: "webpage".to_string(),
                file_path: None,
                file_name: None,
                file_size: None,
                mime_type: None,
            },
            Media::Photo(_) => MediaInfo {
                media_type: "photo".to_string(),
                file_path: None, // TODO: Download and set path
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
                    } else {
                        "document"
                    }
                } else {
                    "document"
                };

                MediaInfo {
                    media_type: media_type.to_string(),
                    file_path: None, // TODO: Download and set path
                    file_name: None, // TODO: Extract from attributes
                    file_size: Some(doc.size() as u64),
                    mime_type: doc.mime_type().map(|s| s.to_string()),
                }
            }
            _ => MediaInfo {
                media_type: "other".to_string(),
                file_path: None,
                file_name: None,
                file_size: None,
                mime_type: None,
            },
        };

        vec![media_info]
    })
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

    eprintln!("Searching for chat {} in cache...", chat_id);
    
    // Check cache first
    let cached_peer = {
        let peers = wrapper.peers.read().await;
        peers.get(&chat_id).cloned()
    };

    let chat = if let Some(peer) = cached_peer {
        eprintln!("✓ Chat {} found in cache", chat_id);
        peer
    } else {
        eprintln!("Chat {} not in cache, falling back to dialog iteration (slow)...", chat_id);
        // Get chat by ID
        let mut dialogs = wrapper.client.iter_dialogs();
        let mut target_chat = None;

        while let Some(dialog) = dialogs.next().await
            .map_err(|e| format!("Failed to iterate dialogs: {}", e))? {
            let peer = &dialog.peer;
            let id = PeerRef::from(peer).id.bot_api_dialog_id();

            if id == chat_id {
                target_chat = Some(peer.clone());
                // Cache it for next time
                let mut peers = wrapper.peers.write().await;
                peers.insert(chat_id, peer.clone());
                break;
            }
        }
        target_chat.ok_or("Chat not found")?
    };

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
            media: extract_media_info(&msg),
        });

        count += 1;
        if count >= limit {
            break;
        }
    }

    eprintln!("Loaded {} messages from chat {}", messages.len(), chat_id);
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
    eprintln!("===== SEND_MESSAGE CALLED =====");
    eprintln!("Account ID: {}, Chat ID: {}, Text: {}", account_id, chat_id, text);

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

    eprintln!("Searching for chat {} in cache for sending...", chat_id);
    
    // Check cache first
    let cached_peer = {
        let peers = wrapper.peers.read().await;
        peers.get(&chat_id).cloned()
    };

    let chat = if let Some(peer) = cached_peer {
        eprintln!("✓ Chat {} found in cache", chat_id);
        peer
    } else {
        eprintln!("Chat {} not in cache, falling back to dialog iteration (slow)...", chat_id);
        // Get chat by ID
        let mut dialogs = wrapper.client.iter_dialogs();
        let mut target_chat = None;

        while let Some(dialog) = dialogs.next().await
            .map_err(|e| format!("Failed to iterate dialogs: {}", e))? {
            let peer = &dialog.peer;
            let id = PeerRef::from(peer).id.bot_api_dialog_id();

            if id == chat_id {
                target_chat = Some(peer.clone());
                // Cache it for next time
                let mut peers = wrapper.peers.write().await;
                peers.insert(chat_id, peer.clone());
                break;
            }
        }
        target_chat.ok_or("Chat not found")?
    };

    eprintln!("Sending message to chat {}...", chat_id);

    // Send message
    let sent_message = wrapper.client.send_message(&chat, text.clone()).await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    eprintln!("Message sent successfully! ID: {}", sent_message.id());

    // Convert to our Message format
    let message = Message {
        id: sent_message.id(),
        chat_id,
        from_user_id: sent_message.sender().map(|s| PeerRef::from(s).id.bot_api_dialog_id()),
        text: Some(text),
        date: sent_message.date().timestamp(),
        is_outgoing: true,
        media: extract_media_info(&sent_message),
    };

    Ok(message)
}

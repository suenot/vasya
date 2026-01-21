//! Chat commands for retrieving dialogs and messages

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_client::types::Peer;
use grammers_session::defs::PeerRef;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Chat {
    pub id: i64,
    pub title: String,
    pub username: Option<String>,
    pub unread_count: i32,
    pub chat_type: String, // "user", "group", "channel"
    pub last_message: Option<String>,
}

/// Get list of chats/dialogs
#[tauri::command]
pub async fn get_chats(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<Chat>, String> {
    eprintln!("===== GET_CHATS CALLED =====");
    eprintln!("Account ID: {}", account_id);

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found for this account")?;

    eprintln!("Fetching dialogs from Telegram...");

    // Get all dialogs (chats)
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

        chats.push(Chat {
            id: chat_id,
            title: title.clone(),
            username,
            unread_count: 0, // TODO: get actual unread count
            chat_type: chat_type.to_string(),
            last_message: None, // TODO: get last message
        });

        eprintln!("Found chat: {} ({})", title, chat_type);
    }

    eprintln!("Total chats found: {}", chats.len());
    Ok(chats)
}

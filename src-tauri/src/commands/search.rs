//! Global search and cross-chat message search commands

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::AppState;

/// A result item from global contacts/channels search
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchResult {
    pub id: i64,
    pub title: String,
    pub username: Option<String>,
    pub result_type: String, // "user", "group", "channel"
    pub subscribers_count: Option<i32>,
}

/// A message result from cross-chat search
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalMessageResult {
    pub message_id: i32,
    pub chat_id: i64,
    pub chat_title: String,
    pub sender_name: Option<String>,
    pub text: Option<String>,
    pub date: i64,
}

/// Global search for users and channels via contacts.Search TL API
#[tauri::command]
pub async fn global_search(
    account_id: String,
    query: String,
    limit: Option<i32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<GlobalSearchResult>, String> {
    tracing::info!(
        account_id = %account_id,
        query = %query,
        "Global search"
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
    };

    let limit = limit.unwrap_or(20);

    let request = grammers_tl_types::functions::contacts::Search {
        q: query.clone(),
        limit,
    };

    let result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to perform global search: {}", e))?;

    let mut results = Vec::new();

    match result {
        grammers_tl_types::enums::contacts::Found::Found(found) => {
            // Process users
            for user in &found.users {
                match user {
                    grammers_tl_types::enums::User::User(u) => {
                        let title = {
                            let first = u.first_name.as_deref().unwrap_or("");
                            let last = u.last_name.as_deref().unwrap_or("");
                            if last.is_empty() {
                                first.to_string()
                            } else {
                                format!("{} {}", first, last)
                            }
                        };
                        results.push(GlobalSearchResult {
                            id: u.id,
                            title,
                            username: u.username.clone(),
                            result_type: "user".to_string(),
                            subscribers_count: None,
                        });
                    }
                    _ => {}
                }
            }

            // Process chats (groups and channels)
            for chat in &found.chats {
                match chat {
                    grammers_tl_types::enums::Chat::Channel(ch) => {
                        let result_type = if ch.broadcast {
                            "channel"
                        } else {
                            "group"
                        };
                        results.push(GlobalSearchResult {
                            id: ch.id,
                            title: ch.title.clone(),
                            username: ch.username.clone(),
                            result_type: result_type.to_string(),
                            subscribers_count: ch.participants_count,
                        });
                    }
                    grammers_tl_types::enums::Chat::Chat(ch) => {
                        results.push(GlobalSearchResult {
                            id: ch.id,
                            title: ch.title.clone(),
                            username: None,
                            result_type: "group".to_string(),
                            subscribers_count: Some(ch.participants_count),
                        });
                    }
                    _ => {}
                }
            }
        }
    }

    tracing::info!(count = results.len(), query = %query, "Global search results");
    Ok(results)
}

/// Search messages across all chats via messages.SearchGlobal TL API
#[tauri::command]
pub async fn search_all_messages(
    account_id: String,
    query: String,
    limit: Option<i32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<GlobalMessageResult>, String> {
    tracing::info!(
        account_id = %account_id,
        query = %query,
        "Search all messages"
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
    };

    let limit = limit.unwrap_or(20);

    let request = grammers_tl_types::functions::messages::SearchGlobal {
        broadcasts_only: false,
        groups_only: false,
        users_only: false,
        folder_id: None,
        q: query.clone(),
        filter: grammers_tl_types::enums::MessagesFilter::InputMessagesFilterEmpty,
        min_date: 0,
        max_date: 0,
        offset_rate: 0,
        offset_peer: grammers_tl_types::enums::InputPeer::Empty,
        offset_id: 0,
        limit,
    };

    let result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to search global messages: {}", e))?;

    let (raw_messages, raw_chats, raw_users) = match result {
        grammers_tl_types::enums::messages::Messages::Messages(m) => {
            (m.messages, m.chats, m.users)
        }
        grammers_tl_types::enums::messages::Messages::Slice(m) => {
            (m.messages, m.chats, m.users)
        }
        grammers_tl_types::enums::messages::Messages::ChannelMessages(m) => {
            (m.messages, m.chats, m.users)
        }
        grammers_tl_types::enums::messages::Messages::NotModified(_) => {
            (Vec::new(), Vec::new(), Vec::new())
        }
    };

    // Build lookup maps for chat titles and user names
    let mut chat_titles: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    for chat in &raw_chats {
        match chat {
            grammers_tl_types::enums::Chat::Channel(ch) => {
                chat_titles.insert(ch.id, ch.title.clone());
            }
            grammers_tl_types::enums::Chat::Chat(ch) => {
                chat_titles.insert(ch.id, ch.title.clone());
            }
            _ => {}
        }
    }

    let mut user_names: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    for user in &raw_users {
        match user {
            grammers_tl_types::enums::User::User(u) => {
                let name = {
                    let first = u.first_name.as_deref().unwrap_or("");
                    let last = u.last_name.as_deref().unwrap_or("");
                    if last.is_empty() {
                        first.to_string()
                    } else {
                        format!("{} {}", first, last)
                    }
                };
                user_names.insert(u.id, name);
            }
            _ => {}
        }
    }

    let mut results = Vec::new();

    for msg in raw_messages {
        match msg {
            grammers_tl_types::enums::Message::Message(m) => {
                // Resolve chat id from peer_id
                let chat_id = match &m.peer_id {
                    grammers_tl_types::enums::Peer::User(u) => u.user_id,
                    grammers_tl_types::enums::Peer::Chat(c) => c.chat_id,
                    grammers_tl_types::enums::Peer::Channel(c) => c.channel_id,
                };

                let chat_title = chat_titles
                    .get(&chat_id)
                    .or_else(|| user_names.get(&chat_id))
                    .cloned()
                    .unwrap_or_else(|| format!("Chat {}", chat_id));

                let sender_name = m.from_id.as_ref().and_then(|p| {
                    match p {
                        grammers_tl_types::enums::Peer::User(u) => user_names.get(&u.user_id).cloned(),
                        grammers_tl_types::enums::Peer::Channel(c) => chat_titles.get(&c.channel_id).cloned(),
                        grammers_tl_types::enums::Peer::Chat(c) => chat_titles.get(&c.chat_id).cloned(),
                    }
                });

                // Truncate text for preview
                let text = if m.message.is_empty() {
                    None
                } else if m.message.chars().count() > 200 {
                    let truncated: String = m.message.chars().take(200).collect();
                    Some(format!("{}...", truncated))
                } else {
                    Some(m.message.clone())
                };

                results.push(GlobalMessageResult {
                    message_id: m.id,
                    chat_id,
                    chat_title,
                    sender_name,
                    text,
                    date: m.date as i64,
                });
            }
            _ => {}
        }
    }

    tracing::info!(count = results.len(), query = %query, "Global message search results");
    Ok(results)
}

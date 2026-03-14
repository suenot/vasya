//! Forum topics commands
//!
//! Retrieves topics from Telegram forum supergroups using raw TL API calls.

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use grammers_session::defs::PeerRef;
use grammers_tl_types as tl;

use crate::AppState;
use super::peer_resolve::resolve_peer;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForumTopic {
    pub id: i32,
    pub title: String,
    pub icon_color: i32,
    pub icon_emoji_id: Option<i64>,
    pub unread_count: i32,
    pub top_message: i32,
    pub is_pinned: bool,
    pub is_closed: bool,
}

/// Get forum topics for a forum supergroup
#[tauri::command]
pub async fn get_forum_topics(
    account_id: String,
    chat_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<ForumTopic>, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        "Getting forum topics"
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

    let peer = resolve_peer(&wrapper, chat_id).await?;
    let input_peer: tl::enums::InputPeer = PeerRef::from(&peer).into();

    let request = tl::functions::messages::GetForumTopics {
        peer: input_peer,
        q: None,
        offset_date: 0,
        offset_id: 0,
        offset_topic: 0,
        limit: 100,
    };

    let result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to get forum topics: {}", e))?;

    let tl::enums::messages::ForumTopics::Topics(forum_topics) = result;

    let topics: Vec<ForumTopic> = forum_topics
        .topics
        .into_iter()
        .filter_map(|topic| {
            match topic {
                tl::enums::ForumTopic::Topic(t) => Some(ForumTopic {
                    id: t.id,
                    title: t.title,
                    icon_color: t.icon_color,
                    icon_emoji_id: t.icon_emoji_id,
                    unread_count: t.unread_count,
                    top_message: t.top_message,
                    is_pinned: t.pinned,
                    is_closed: t.closed,
                }),
                tl::enums::ForumTopic::Deleted(_) => None,
            }
        })
        .collect();

    tracing::info!(count = topics.len(), chat_id = chat_id, "Forum topics loaded");
    Ok(topics)
}

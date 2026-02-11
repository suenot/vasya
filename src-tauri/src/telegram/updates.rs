//! Telegram updates handler
//!
//! Processes real-time updates from Telegram (new messages, edits, deletions, etc.)
//! and emits them as Tauri events to the frontend.

use grammers_client::client::updates::UpdateStream;
use grammers_client::types::{Message as GrammersMessage, Update};
use grammers_session::defs::PeerId;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use crate::commands::media_types::classify_media_type;

/// Events emitted to the frontend
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessageEvent {
    pub id: i32,
    pub chat_id: i64,
    pub from_user_id: Option<i64>,
    pub text: Option<String>,
    pub date: i64,
    pub is_outgoing: bool,
    pub account_id: String,
    pub has_media: bool,
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEditedEvent {
    pub id: i32,
    pub chat_id: i64,
    pub new_text: Option<String>,
    pub edit_date: i64,
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDeletedEvent {
    pub message_ids: Vec<i32>,
    pub chat_id: i64,
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusEvent {
    pub account_id: String,
    pub status: String, // "connected", "reconnecting", "disconnected"
}

/// Convert a grammers Message to our event format
fn message_to_event(msg: &GrammersMessage, account_id: &str) -> NewMessageEvent {
    let chat_id = msg.peer_id().bot_api_dialog_id();

    let has_media = msg.media().is_some();
    let media_type = msg.media().map(|m| classify_media_type(&m).to_string());

    NewMessageEvent {
        id: msg.id(),
        chat_id,
        from_user_id: msg.sender().map(|s| s.id().bot_api_dialog_id()),
        text: if msg.text().is_empty() {
            None
        } else {
            Some(msg.text().to_string())
        },
        date: msg.date().timestamp(),
        is_outgoing: msg.outgoing(),
        account_id: account_id.to_string(),
        has_media,
        media_type,
    }
}

/// Shutdown signal type
pub type ShutdownTx = broadcast::Sender<()>;
pub type ShutdownRx = broadcast::Receiver<()>;

/// Create a shutdown channel
pub fn shutdown_channel() -> (ShutdownTx, ShutdownRx) {
    broadcast::channel(1)
}

/// Spawn an updates handler task for an account.
///
/// Accepts an `UpdateStream` created from `client.stream_updates(receiver, config)`.
/// Listens for Telegram updates and emits Tauri events.
/// Returns a JoinHandle that can be used to track/cancel the task.
pub fn spawn_updates_handler(
    mut update_stream: UpdateStream,
    account_id: String,
    app: AppHandle,
    mut shutdown_rx: ShutdownRx,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!(
            account_id = %account_id,
            "Updates handler started"
        );

        // Emit connected status
        let _ = app.emit(
            "connection-status",
            ConnectionStatusEvent {
                account_id: account_id.clone(),
                status: "connected".to_string(),
            },
        );

        loop {
            tokio::select! {
                // Check for shutdown signal
                _ = shutdown_rx.recv() => {
                    tracing::info!(
                        account_id = %account_id,
                        "Updates handler shutting down"
                    );
                    break;
                }
                // Process next update from the stream
                update = update_stream.next() => {
                    match update {
                        Ok(update) => {
                            handle_update(&update, &account_id, &app);
                        }
                        Err(e) => {
                            tracing::error!(
                                account_id = %account_id,
                                error = %e,
                                "Error receiving update, will retry"
                            );

                            // Emit reconnecting status
                            let _ = app.emit(
                                "connection-status",
                                ConnectionStatusEvent {
                                    account_id: account_id.clone(),
                                    status: "reconnecting".to_string(),
                                },
                            );

                            // Brief pause before retry
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        }
                    }
                }
            }
        }

        // Emit disconnected status
        let _ = app.emit(
            "connection-status",
            ConnectionStatusEvent {
                account_id: account_id.clone(),
                status: "disconnected".to_string(),
            },
        );
    })
}

/// Process a single Telegram update
fn handle_update(update: &Update, account_id: &str, app: &AppHandle) {
    match update {
        Update::NewMessage(msg) if !msg.outgoing() => {
            tracing::debug!(
                account_id = %account_id,
                msg_id = msg.id(),
                "New incoming message"
            );

            let event = message_to_event(msg, account_id);
            if let Err(e) = app.emit("telegram:new-message", &event) {
                tracing::error!(error = %e, "Failed to emit new-message event");
            }
        }
        Update::NewMessage(msg) if msg.outgoing() => {
            // Outgoing messages (sent from other devices)
            let event = message_to_event(msg, account_id);
            if let Err(e) = app.emit("telegram:new-message", &event) {
                tracing::error!(error = %e, "Failed to emit outgoing-message event");
            }
        }
        Update::MessageEdited(msg) => {
            let chat_id = msg.peer_id().bot_api_dialog_id();
            let event = MessageEditedEvent {
                id: msg.id(),
                chat_id,
                new_text: if msg.text().is_empty() {
                    None
                } else {
                    Some(msg.text().to_string())
                },
                edit_date: msg.date().timestamp(),
                account_id: account_id.to_string(),
            };

            if let Err(e) = app.emit("telegram:message-edited", &event) {
                tracing::error!(error = %e, "Failed to emit message-edited event");
            }
        }
        Update::MessageDeleted(deleted) => {
            // channel_id() returns Option<i64> (bare id), convert to bot_api format
            let chat_id = deleted
                .channel_id()
                .map(|id| PeerId::channel(id).bot_api_dialog_id())
                .unwrap_or(0);

            let event = MessageDeletedEvent {
                message_ids: deleted.messages().to_vec(),
                chat_id,
                account_id: account_id.to_string(),
            };

            if let Err(e) = app.emit("telegram:message-deleted", &event) {
                tracing::error!(error = %e, "Failed to emit message-deleted event");
            }
        }
        _ => {
            // Other update types (user status, typing, etc.) - can be added later
        }
    }
}

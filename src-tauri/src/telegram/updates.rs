//! Telegram updates handler
//!
//! Processes real-time updates from Telegram (new messages, edits, deletions, etc.)
//! and emits them as Tauri events to the frontend.

use std::sync::Arc;
use grammers_client::client::updates::UpdateStream;
use grammers_client::types::{Message as GrammersMessage, Media, Update};
use grammers_session::defs::PeerId;
use grammers_tl_types as tl;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{broadcast, RwLock};

use crate::AppState;
use crate::commands::media_types::classify_media_type;
use crate::telegram::call_state::*;

/// Media info included in real-time events (no file_path — not downloaded yet)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfoEvent {
    pub media_type: String,
    pub file_size: Option<u64>,
    pub mime_type: Option<String>,
}

/// Events emitted to the frontend
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessageEvent {
    pub id: i32,
    pub chat_id: i64,
    pub from_user_id: Option<i64>,
    pub sender_name: Option<String>,
    pub text: Option<String>,
    pub date: i64,
    pub is_outgoing: bool,
    pub account_id: String,
    pub has_media: bool,
    pub media_type: Option<String>,
    pub media: Option<Vec<MediaInfoEvent>>,
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

/// Extract media info for events (without file_path)
fn extract_media_info_for_event(media: &Media) -> MediaInfoEvent {
    let media_type = classify_media_type(media).to_string();
    let (file_size, mime_type) = match media {
        Media::Document(doc) => (
            Some(doc.size() as u64),
            doc.mime_type().map(|s| s.to_string()),
        ),
        Media::Photo(_) => (None, Some("image/jpeg".to_string())),
        _ => (None, None),
    };
    MediaInfoEvent {
        media_type,
        file_size,
        mime_type,
    }
}

/// Convert a grammers Message to our event format
fn message_to_event(msg: &GrammersMessage, account_id: &str) -> NewMessageEvent {
    let chat_id = msg.peer_id().bot_api_dialog_id();

    let has_media = msg.media().is_some();
    let media_type = msg.media().as_ref().map(|m| classify_media_type(m).to_string());
    let media = msg.media().as_ref().map(|m| vec![extract_media_info_for_event(m)]);

    let sender = msg.sender();
    NewMessageEvent {
        id: msg.id(),
        chat_id,
        from_user_id: sender.as_ref().map(|s| s.id().bot_api_dialog_id()),
        sender_name: sender.and_then(|s| s.name().map(|n| n.to_string())),
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
        media,
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
        Update::Raw(raw) => {
            tracing::debug!("Raw update received: {:?}", std::mem::discriminant(&raw.raw));
            match &raw.raw {
                tl::enums::Update::PhoneCall(update) => {
                    tracing::info!("PhoneCall update received: {:?}", std::mem::discriminant(&update.phone_call));
                    handle_phone_call_update(&update.phone_call, account_id, app);
                }
                tl::enums::Update::PhoneCallSignalingData(update) => {
                    let event = serde_json::json!({
                        "callId": update.phone_call_id,
                        "data": update.data,
                        "accountId": account_id,
                    });
                    let _ = app.emit("telegram:call-signaling-data", &event);
                }
                tl::enums::Update::GroupCall(update) => {
                    handle_group_call_update(update, account_id, app);
                }
                tl::enums::Update::GroupCallParticipants(update) => {
                    handle_group_call_participants_update(update, account_id, app);
                }
                tl::enums::Update::GroupCallConnection(update) => {
                    let params_data = match &update.params {
                        tl::enums::DataJson::Json(json) => &json.data,
                    };
                    let event = serde_json::json!({
                        "presentation": update.presentation,
                        "params": params_data,
                        "accountId": account_id,
                    });
                    if let Err(e) = app.emit("telegram:group-call-connection", &event) {
                        tracing::error!(error = %e, "Failed to emit group-call-connection event");
                    }
                }
                _ => {
                    // Other raw update types (user status, typing, etc.)
                }
            }
        }
        _ => {
            // Other update types not yet handled
        }
    }
}

/// Handle phone call updates from Telegram
fn handle_phone_call_update(
    phone_call: &tl::enums::PhoneCall,
    account_id: &str,
    app: &AppHandle,
) {
    match phone_call {
        tl::enums::PhoneCall::Requested(req) => {
            tracing::info!(
                call_id = req.id,
                admin_id = req.admin_id,
                "Incoming call"
            );

            // Store in active_calls and send phone.receivedCall acknowledgement
            let app_state = app.state::<Arc<RwLock<AppState>>>();
            let call_id = req.id;
            let access_hash = req.access_hash;
            let admin_id = req.admin_id;
            let is_video = req.video;
            let account_id_owned = account_id.to_string();

            let state_clone = app_state.inner().clone();
            tokio::spawn(async move {
                let state_guard = state_clone.read().await;

                // Store call info
                let call_info = CallInfo {
                    call_id,
                    access_hash,
                    peer_user_id: admin_id,
                    is_outgoing: false,
                    is_video,
                    state: CallState::Ringing,
                    dh_exchange: None,
                    shared_key: None,
                    key_fingerprint: None,
                    account_id: account_id_owned.clone(),
                };
                let active_calls = state_guard.active_calls.clone();
                {
                    let mut calls = active_calls.write().await;
                    calls.calls.insert(call_id, call_info);
                }

                // Acknowledge receipt of call (required by Telegram protocol)
                if let Some(cm) = state_guard.client_manager.as_ref() {
                    if let Some(wrapper) = cm.get_client(&account_id_owned).await {
                        let peer = tl::enums::InputPhoneCall::Call(tl::types::InputPhoneCall {
                            id: call_id,
                            access_hash,
                        });
                        if let Err(e) = wrapper.client.invoke(&tl::functions::phone::ReceivedCall { peer }).await {
                            tracing::warn!(error = %e, "Failed to send phone.receivedCall");
                        }
                    }
                }
            });

            let event = serde_json::json!({
                "callId": req.id,
                "accessHash": req.access_hash,
                "userId": req.admin_id,
                "isVideo": req.video,
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:incoming-call", &event) {
                tracing::error!(error = %e, "Failed to emit incoming-call event");
            }
        }
        tl::enums::PhoneCall::Waiting(w) => {
            let event = serde_json::json!({
                "callId": w.id,
                "state": "waiting",
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:call-state-changed", &event) {
                tracing::error!(error = %e, "Failed to emit call-state-changed event");
            }
        }
        tl::enums::PhoneCall::Accepted(a) => {
            // The callee accepted; include g_b so frontend can trigger confirm_call
            let event = serde_json::json!({
                "callId": a.id,
                "state": "accepted",
                "gB": a.g_b,
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:call-state-changed", &event) {
                tracing::error!(error = %e, "Failed to emit call-state-changed event");
            }
        }
        tl::enums::PhoneCall::Call(c) => {
            // Call is now active (after confirmCall on both sides)
            let event = serde_json::json!({
                "callId": c.id,
                "state": "active",
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:call-state-changed", &event) {
                tracing::error!(error = %e, "Failed to emit call-state-changed event");
            }
        }
        tl::enums::PhoneCall::Discarded(d) => {
            let reason = d.reason.as_ref().map(|r| match r {
                tl::enums::PhoneCallDiscardReason::Missed => "missed",
                tl::enums::PhoneCallDiscardReason::Disconnect => "disconnect",
                tl::enums::PhoneCallDiscardReason::Hangup => "hangup",
                tl::enums::PhoneCallDiscardReason::Busy => "busy",
                tl::enums::PhoneCallDiscardReason::MigrateConferenceCall(_) => "migrate",
            }).unwrap_or("unknown");

            // Remove from active_calls
            let app_state = app.state::<Arc<RwLock<AppState>>>();
            let call_id = d.id;
            let state_clone = app_state.inner().clone();
            tokio::spawn(async move {
                let state_guard = state_clone.read().await;
                let mut calls = state_guard.active_calls.write().await;
                calls.calls.remove(&call_id);
            });

            let event = serde_json::json!({
                "callId": d.id,
                "state": "discarded",
                "reason": reason,
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:call-state-changed", &event) {
                tracing::error!(error = %e, "Failed to emit call-state-changed event");
            }
        }
        tl::enums::PhoneCall::Empty(_) => {
            // Ignore empty phone call updates
        }
    }
}

/// Handle group call updates from Telegram
fn handle_group_call_update(
    update: &tl::types::UpdateGroupCall,
    account_id: &str,
    app: &AppHandle,
) {
    match &update.call {
        tl::enums::GroupCall::Call(call) => {
            let event = serde_json::json!({
                "callId": call.id,
                "accessHash": call.access_hash,
                "chatId": update.chat_id,
                "title": call.title,
                "participantsCount": call.participants_count,
                "canStartVideo": call.can_start_video,
                "state": "active",
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:group-call-update", &event) {
                tracing::error!(error = %e, "Failed to emit group-call-update event");
            }
        }
        tl::enums::GroupCall::Discarded(d) => {
            // Remove from active group calls
            let app_state = app.state::<Arc<RwLock<AppState>>>();
            let call_id = d.id;
            let state_clone = app_state.inner().clone();
            tokio::spawn(async move {
                let state_guard = state_clone.read().await;
                let mut calls = state_guard.active_group_calls.write().await;
                calls.calls.remove(&call_id);
            });

            let event = serde_json::json!({
                "callId": d.id,
                "state": "discarded",
                "duration": d.duration,
                "accountId": account_id,
            });
            if let Err(e) = app.emit("telegram:group-call-update", &event) {
                tracing::error!(error = %e, "Failed to emit group-call-update event");
            }
        }
    }
}

/// Handle group call participants updates from Telegram
fn handle_group_call_participants_update(
    update: &tl::types::UpdateGroupCallParticipants,
    account_id: &str,
    app: &AppHandle,
) {
    let call_input = match &update.call {
        tl::enums::InputGroupCall::Call(c) => Some((c.id, c.access_hash)),
        _ => None,
    };

    let participants: Vec<serde_json::Value> = update
        .participants
        .iter()
        .map(|p| match p {
            tl::enums::GroupCallParticipant::Participant(participant) => {
                let peer_id = match &participant.peer {
                    tl::enums::Peer::User(u) => u.user_id,
                    tl::enums::Peer::Chat(c) => c.chat_id,
                    tl::enums::Peer::Channel(c) => c.channel_id,
                };
                serde_json::json!({
                    "userId": peer_id,
                    "isMuted": participant.muted,
                    "isSelf": participant.is_self,
                    "left": participant.left,
                    "canSelfUnmute": participant.can_self_unmute,
                    "videoJoined": participant.video_joined,
                    "volume": participant.volume,
                    "about": participant.about,
                    "raiseHandRating": participant.raise_hand_rating,
                    "source": participant.source,
                })
            }
        })
        .collect();

    let event = serde_json::json!({
        "callId": call_input.map(|(id, _)| id),
        "accessHash": call_input.map(|(_, ah)| ah),
        "participants": participants,
        "version": update.version,
        "accountId": account_id,
    });

    if let Err(e) = app.emit("telegram:group-call-participants", &event) {
        tracing::error!(error = %e, "Failed to emit group-call-participants event");
    }
}

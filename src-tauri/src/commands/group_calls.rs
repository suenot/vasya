//! Telegram group call commands

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::State;
use grammers_tl_types as tl;
use grammers_session::defs::PeerRef;

use crate::AppState;
use crate::telegram::group_call_state::*;
use crate::commands::peer_resolve::resolve_peer;

/// Helper to build an InputGroupCall enum value
fn build_input_group_call(call_id: i64, access_hash: i64) -> tl::enums::InputGroupCall {
    tl::enums::InputGroupCall::Call(tl::types::InputGroupCall {
        id: call_id,
        access_hash,
    })
}

/// Extract a GroupCall from Updates returned by Telegram
fn extract_group_call_from_updates(
    updates: &tl::enums::Updates,
) -> Option<(i64, i64, Option<String>, i32, bool)> {
    // Look through updates for a GroupCall update
    let update_list = match updates {
        tl::enums::Updates::Updates(u) => &u.updates,
        tl::enums::Updates::Combined(u) => &u.updates,
        _ => return None,
    };

    for update in update_list {
        if let tl::enums::Update::GroupCall(gc_update) = update {
            match &gc_update.call {
                tl::enums::GroupCall::Call(call) => {
                    return Some((
                        call.id,
                        call.access_hash,
                        call.title.clone(),
                        call.participants_count,
                        call.can_start_video,
                    ));
                }
                tl::enums::GroupCall::Discarded(_) => {
                    return None;
                }
            }
        }
    }
    None
}

/// Extract peer id from tl Peer enum
fn peer_id_from_tl(peer: &tl::enums::Peer) -> i64 {
    match peer {
        tl::enums::Peer::User(u) => u.user_id,
        tl::enums::Peer::Chat(c) => c.chat_id,
        tl::enums::Peer::Channel(c) => c.channel_id,
    }
}

#[tauri::command]
pub async fn create_group_call(
    account_id: String,
    chat_id: i64,
    title: Option<String>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<GroupCallInfoResponse, String> {
    tracing::info!(
        account_id = %account_id,
        chat_id = chat_id,
        "Creating group call"
    );

    let (wrapper, active_group_calls) = {
        let state_guard = state.read().await;
        let client_manager = state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?;
        let wrapper = client_manager
            .get_client(&account_id)
            .await
            .ok_or("Client not found for this account")?;
        let active_group_calls = state_guard.active_group_calls.clone();
        (wrapper, active_group_calls)
    };

    // Resolve chat_id to InputPeer
    let peer = resolve_peer(&wrapper, chat_id).await?;
    let input_peer: tl::enums::InputPeer = PeerRef::from(&peer).into();

    let random_id = rand::random::<i32>();

    let request = tl::functions::phone::CreateGroupCall {
        rtmp_stream: false,
        peer: input_peer,
        random_id,
        title: title.clone(),
        schedule_date: None,
    };

    let result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to create group call: {}", e))?;

    // Extract group call info from the Updates response
    let (call_id, access_hash, gc_title, _participants_count, _can_start_video) =
        extract_group_call_from_updates(&result)
            .ok_or("Failed to extract group call from updates response")?;

    let call_info = GroupCallInfo {
        call_id,
        access_hash,
        chat_id,
        state: GroupCallState::Active,
        title: gc_title.clone(),
        participants: HashMap::new(),
        source: None,
        account_id: account_id.clone(),
    };

    let response = call_info.to_response();

    {
        let mut calls = active_group_calls.write().await;
        calls.calls.insert(call_id, call_info);
    }

    tracing::info!(call_id = call_id, "Group call created successfully");
    Ok(response)
}

#[tauri::command]
pub async fn join_group_call(
    account_id: String,
    call_id: i64,
    access_hash: i64,
    chat_id: i64,
    muted: bool,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<GroupCallInfoResponse, String> {
    tracing::info!(
        account_id = %account_id,
        call_id = call_id,
        chat_id = chat_id,
        "Joining group call"
    );

    let (wrapper, active_group_calls) = {
        let state_guard = state.read().await;
        let client_manager = state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?;
        let wrapper = client_manager
            .get_client(&account_id)
            .await
            .ok_or("Client not found for this account")?;
        let active_group_calls = state_guard.active_group_calls.clone();
        (wrapper, active_group_calls)
    };

    // Generate a random SSRC source
    let source: i32 = rand::random();

    let input_group_call = build_input_group_call(call_id, access_hash);

    // For now, send an empty JSON object as SDP params.
    // Real SDP negotiation will come when we wire up WebRTC.
    let params = tl::enums::DataJson::Json(tl::types::DataJson {
        data: "{}".to_string(),
    });

    let request = tl::functions::phone::JoinGroupCall {
        muted,
        video_stopped: true,
        call: input_group_call,
        join_as: tl::enums::InputPeer::PeerSelf,
        invite_hash: None,
        public_key: None,
        block: None,
        params,
    };

    let _result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to join group call: {}", e))?;

    let call_info = GroupCallInfo {
        call_id,
        access_hash,
        chat_id,
        state: GroupCallState::Active,
        title: None,
        participants: HashMap::new(),
        source: Some(source),
        account_id: account_id.clone(),
    };

    let response = call_info.to_response();

    {
        let mut calls = active_group_calls.write().await;
        calls.calls.insert(call_id, call_info);
    }

    tracing::info!(call_id = call_id, "Joined group call successfully");
    Ok(response)
}

#[tauri::command]
pub async fn leave_group_call(
    account_id: String,
    call_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!(
        account_id = %account_id,
        call_id = call_id,
        "Leaving group call"
    );

    let (wrapper, active_group_calls) = {
        let state_guard = state.read().await;
        let client_manager = state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?;
        let wrapper = client_manager
            .get_client(&account_id)
            .await
            .ok_or("Client not found for this account")?;
        let active_group_calls = state_guard.active_group_calls.clone();
        (wrapper, active_group_calls)
    };

    // Get the call info (access_hash, source)
    let (access_hash, source) = {
        let calls = active_group_calls.read().await;
        let call = calls
            .calls
            .get(&call_id)
            .ok_or("Group call not found in active calls")?;
        (call.access_hash, call.source.unwrap_or(0))
    };

    let input_group_call = build_input_group_call(call_id, access_hash);

    let request = tl::functions::phone::LeaveGroupCall {
        call: input_group_call,
        source,
    };

    wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to leave group call: {}", e))?;

    // Remove from active calls
    {
        let mut calls = active_group_calls.write().await;
        calls.calls.remove(&call_id);
    }

    tracing::info!(call_id = call_id, "Left group call successfully");
    Ok(())
}

#[tauri::command]
pub async fn toggle_group_call_mute(
    account_id: String,
    call_id: i64,
    muted: bool,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!(
        account_id = %account_id,
        call_id = call_id,
        muted = muted,
        "Toggle group call mute"
    );

    let (wrapper, active_group_calls) = {
        let state_guard = state.read().await;
        let client_manager = state_guard
            .client_manager
            .as_ref()
            .ok_or("Client manager not initialized")?;
        let wrapper = client_manager
            .get_client(&account_id)
            .await
            .ok_or("Client not found for this account")?;
        let active_group_calls = state_guard.active_group_calls.clone();
        (wrapper, active_group_calls)
    };

    let access_hash = {
        let calls = active_group_calls.read().await;
        let call = calls
            .calls
            .get(&call_id)
            .ok_or("Group call not found in active calls")?;
        call.access_hash
    };

    let input_group_call = build_input_group_call(call_id, access_hash);

    let request = tl::functions::phone::EditGroupCallParticipant {
        call: input_group_call,
        participant: tl::enums::InputPeer::PeerSelf,
        muted: Some(muted),
        volume: None,
        raise_hand: None,
        video_stopped: None,
        video_paused: None,
        presentation_paused: None,
    };

    wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to toggle group call mute: {}", e))?;

    tracing::info!(call_id = call_id, muted = muted, "Group call mute toggled");
    Ok(())
}

#[tauri::command]
pub async fn get_group_call_participants(
    account_id: String,
    call_id: i64,
    access_hash: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<GroupCallParticipant>, String> {
    tracing::info!(
        account_id = %account_id,
        call_id = call_id,
        "Getting group call participants"
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

    let input_group_call = build_input_group_call(call_id, access_hash);

    let request = tl::functions::phone::GetGroupParticipants {
        call: input_group_call,
        ids: vec![],
        sources: vec![],
        offset: String::new(),
        limit: 100,
    };

    let result = wrapper
        .client
        .invoke(&request)
        .await
        .map_err(|e| format!("Failed to get group call participants: {}", e))?;

    let participants: Vec<GroupCallParticipant> = match result {
        tl::enums::phone::GroupParticipants::Participants(p) => {
            // Build a user_id -> name map from the users list
            let mut user_names: HashMap<i64, String> = HashMap::new();
            for user in &p.users {
                match user {
                    tl::enums::User::User(u) => {
                        let name = match (&u.first_name, &u.last_name) {
                            (Some(first), Some(last)) => format!("{} {}", first, last),
                            (Some(first), None) => first.clone(),
                            (None, Some(last)) => last.clone(),
                            (None, None) => String::new(),
                        };
                        user_names.insert(u.id, name);
                    }
                    tl::enums::User::Empty(e) => {
                        user_names.insert(e.id, String::new());
                    }
                }
            }

            p.participants
                .iter()
                .map(|participant| {
                    match participant {
                        tl::enums::GroupCallParticipant::Participant(p) => {
                            let user_id = peer_id_from_tl(&p.peer);
                            let name = user_names.get(&user_id).cloned();
                            GroupCallParticipant {
                                user_id,
                                name,
                                is_muted: p.muted,
                                is_self: p.is_self,
                                is_speaking: false, // Not directly available from TL
                                volume: p.volume,
                                can_self_unmute: p.can_self_unmute,
                                video_joined: p.video_joined,
                                about: p.about.clone(),
                                raise_hand_rating: p.raise_hand_rating,
                                source: p.source,
                            }
                        }
                    }
                })
                .collect()
        }
    };

    tracing::info!(
        call_id = call_id,
        count = participants.len(),
        "Got group call participants"
    );
    Ok(participants)
}

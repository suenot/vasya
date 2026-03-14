# Telegram Voice & Video Calls - Detailed Implementation Plan

## Status: All 3 phases IMPLEMENTED (skeleton) (2026-03-15)
## Phase 1: DONE (signaling) | Phase 2: DONE (sidecar skeleton, audio IPC) | Phase 3: DONE (group calls, video UI)
## Remaining: WebRTC transport in voip-sidecar, actual audio/video streaming

## Current State
- Placeholder call buttons in `ChatHeader.tsx` (disabled, opacity 0.4)
- i18n translations for call UI strings already in `en.ts` and `ru.ts`
- `grammers-tl-types 0.8` has all phone call TL types (verified in api.tl)
- STT sidecar pattern exists at `src-tauri/stt-sidecar/` as reference for VoIP sidecar

---

## Phase 1: Signal Layer (Call Initiation / Reception)

**Goal:** Ring the other party, receive incoming calls, manage call lifecycle via MTProto. No actual audio/video yet.

### 1.1 Rust: DH Key Exchange Module

**New file:** `src-tauri/src/telegram/dh.rs`
- Generate random 256-byte `a` value using `rand`
- Compute `g_a = pow(g, a, p)` where `g` and `p` come from `messages.getDhConfig`
- Compute `g_a_hash = SHA256(g_a)` for `phone.requestCall`
- On callee side: generate `b`, compute `g_b = pow(g, b, p)`
- Compute shared key: `key = pow(g_a, b, p)` (callee) or `key = pow(g_b, a, p)` (caller)
- Compute `key_fingerprint = SHA1(key)[12..20]` as i64 for `phone.confirmCall`
- Validate: `1 < g_a < p-1` and `1 < g_b < p-1` (security check)
- Store DH config cache (g, p rarely change)

**Dependencies:**
```toml
num-bigint = "0.4"
num-traits = "0.2"
num-integer = "0.1"
rand = "0.8"
```

**Estimated complexity:** Medium (2-3 days). The DH math is well-documented at https://core.telegram.org/api/end-to-end.

### 1.2 Rust: Call State Machine

**New file:** `src-tauri/src/telegram/call_state.rs`
- `CallState` enum: `Idle`, `RequestingCall`, `WaitingForAccept`, `Ringing`, `Accepted`, `Active`, `Discarded`
- `CallInfo` struct holding: `call_id: i64`, `access_hash: i64`, `peer_user_id: i64`, `is_outgoing: bool`, `is_video: bool`, `state: CallState`, `g_a`/`g_b`/`shared_key` (ephemeral), `protocol`, `connections` (once confirmed)
- `ActiveCalls` manager: `HashMap<i64, CallInfo>` keyed by `call_id`
- Stored in `AppState` as `Arc<RwLock<ActiveCalls>>`

**Estimated complexity:** Low (1 day).

### 1.3 Rust: Tauri Commands for Call Control

**New file:** `src-tauri/src/commands/calls.rs`

Commands to implement:

```rust
#[tauri::command]
async fn request_call(
    account_id: String,
    user_id: i64,      // Telegram user ID to call
    is_video: bool,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<CallInfoResponse, String>
```
- Fetch DH config via `messages.getDhConfig`
- Generate `a`, compute `g_a`, `g_a_hash`
- Build `PhoneCallProtocol { udp_p2p: true, udp_reflector: true, min_layer: 92, max_layer: 92, library_versions: ["7.0.0"] }`
- Invoke `phone.requestCall { video, user_id, random_id, g_a_hash, protocol }`
- Parse response `phone.PhoneCall`, store in `ActiveCalls`
- Return `CallInfoResponse` to frontend

```rust
#[tauri::command]
async fn accept_call(
    account_id: String,
    call_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<CallInfoResponse, String>
```
- Retrieve `CallInfo` from `ActiveCalls`
- Generate `b`, compute `g_b`
- Invoke `phone.acceptCall { peer: InputPhoneCall, g_b, protocol }`
- Update call state to `Accepted`

```rust
#[tauri::command]
async fn confirm_call(
    account_id: String,
    call_id: i64,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<CallInfoResponse, String>
```
- Called by the **caller** after receiving `phoneCallAccepted` update
- Extract `g_b` from the update, compute shared key
- Invoke `phone.confirmCall { peer, g_a, key_fingerprint, protocol }`
- Response contains `connections` (STUN/TURN endpoints) -- store them

```rust
#[tauri::command]
async fn discard_call(
    account_id: String,
    call_id: i64,
    reason: String,   // "hangup" | "busy" | "disconnect" | "missed"
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String>
```
- Map reason string to `PhoneCallDiscardReason` enum variant
- Invoke `phone.discardCall { peer, duration, reason, connection_id: 0 }`

```rust
#[tauri::command]
async fn send_call_rating(
    account_id: String,
    call_id: i64,
    rating: i32,       // 1-5
    comment: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String>
```

**Modify:** `src-tauri/src/commands/mod.rs` -- add `pub mod calls; pub use calls::*;`
**Modify:** `src-tauri/src/lib.rs` -- register all new commands in `invoke_handler`
**Modify:** `src-tauri/src/lib.rs` `AppState` -- add `active_calls: Arc<RwLock<ActiveCalls>>` field

**Estimated complexity:** Medium-High (3-4 days). Requires careful handling of TL raw invocations.

### 1.4 Rust: Handle Phone Call Updates

**Modify:** `src-tauri/src/telegram/updates.rs`

Add to the `handle_update` match:

```rust
Update::Raw(raw) => {
    // Check if this is updatePhoneCall or updatePhoneCallSignalingData
    // grammers Update enum may not have PhoneCall variant, so use Raw
    if let Ok(update) = grammers_tl_types::deserialize(...) { ... }
}
```

Actually, since `grammers-client` `Update` enum currently has `NewMessage`, `MessageEdited`, `MessageDeleted`, and a catch-all, phone call updates will land in the `_` branch. We need to:

1. Check if grammers exposes raw update data in the catch-all
2. If not, we may need to intercept at the `UpdatesLike` level before grammers processes them
3. Alternative: patch grammers-client or use `client.invoke()` polling (less ideal)

**Investigation needed:** Check `grammers_client::types::Update` enum variants. If `Raw(tl::types::Update)` exists, we can match `updatePhoneCall` directly. Otherwise, we need a workaround.

**New events to emit:**
- `telegram:incoming-call` -- `{ callId, userId, userName, isVideo, accountId }`
- `telegram:call-state-changed` -- `{ callId, state, accountId }`
- `telegram:call-signaling-data` -- `{ callId, data: number[], accountId }` (Phase 2)

**Estimated complexity:** Medium (2-3 days). Depends on grammers raw update access.

### 1.5 Frontend: Call State Store (Zustand)

**New file:** `src/store/callStore.ts`

```typescript
interface CallState {
  // Active call info
  activeCall: CallInfo | null;
  incomingCall: IncomingCallInfo | null;

  // Actions
  requestCall: (accountId: string, userId: number, isVideo: boolean) => Promise<void>;
  acceptCall: (callId: number) => Promise<void>;
  discardCall: (callId: number, reason: string) => Promise<void>;
  setIncomingCall: (call: IncomingCallInfo | null) => void;
  setCallState: (state: CallStateEnum) => void;

  // Listeners
  setupListeners: () => () => void;  // returns cleanup fn
}

type CallStateEnum =
  | 'idle'
  | 'requesting'
  | 'waiting'
  | 'ringing'
  | 'accepted'
  | 'active'
  | 'ended';

interface CallInfo {
  callId: number;
  peerId: number;
  peerName: string;
  isVideo: boolean;
  isOutgoing: boolean;
  state: CallStateEnum;
  startTime?: number;
  duration?: number;
}

interface IncomingCallInfo {
  callId: number;
  userId: number;
  userName: string;
  isVideo: boolean;
  accountId: string;
}
```

Listen to Tauri events:
- `telegram:incoming-call` -> show incoming call dialog
- `telegram:call-state-changed` -> update call state
- Auto-discard on timeout (30s ringing)

**Estimated complexity:** Low-Medium (1-2 days).

### 1.6 Frontend: Call UI Components

**New file:** `src/components/Call/IncomingCallDialog.tsx`
- Full-screen overlay (or modal) showing caller name, avatar
- Accept / Decline buttons
- Plays ringtone via `<audio>` element (use built-in notification sound)
- Auto-decline after 30s timeout

**New file:** `src/components/Call/OutgoingCallScreen.tsx`
- Shows "Calling..." with callee name/avatar
- Cancel button
- Animating ring indicator

**New file:** `src/components/Call/InCallScreen.tsx`
- Timer display (call duration)
- Hang up button (red)
- Mute mic button (toggle, visual state only in Phase 1)
- Speaker button (toggle, visual state only in Phase 1)
- Video toggle button (disabled in Phase 1)
- Callee name and avatar

**New file:** `src/components/Call/CallOverlay.tsx`
- Root component that renders the appropriate call screen based on `callStore` state
- Positioned as fixed overlay above all other content
- Minimizable to a small floating pill (like Telegram desktop)

**New file:** `src/components/Call/index.ts`
- Barrel export

**New file:** `src/components/Call/CallOverlay.css`
- Styles for all call UI states

**Modify:** `src/components/Chat/ChatHeader.tsx`
- Enable the call buttons (remove `disabled`, `opacity: 0.4`, `cursor: not-allowed`)
- Wire `onClick` to `callStore.requestCall(accountId, userId, false)` (audio) / `true` (video)
- Only enable for private chats (1-on-1), disable for groups/channels

**Modify:** `src/App.tsx` (or equivalent root)
- Mount `<CallOverlay />` at root level
- Initialize call event listeners via `callStore.setupListeners()`

**New i18n keys to add** (to both `en.ts` and `ru.ts`):
- `call_incoming` / `call_outgoing` / `call_connecting` / `call_ended`
- `call_accept` / `call_decline`
- `call_duration` (format helper)
- `call_missed`

**Estimated complexity:** Medium (3-4 days).

### Phase 1 Summary

| Category | Files | Count |
|----------|-------|-------|
| New Rust files | `telegram/dh.rs`, `telegram/call_state.rs`, `commands/calls.rs` | 3 |
| Modified Rust files | `telegram/mod.rs`, `telegram/updates.rs`, `commands/mod.rs`, `lib.rs` | 4 |
| New TS files | `store/callStore.ts`, `components/Call/*.tsx` (5 files) | 6 |
| Modified TS files | `ChatHeader.tsx`, `App.tsx`, `i18n/locales/en.ts`, `i18n/locales/ru.ts` | 4 |
| New crates | `num-bigint`, `num-traits`, `num-integer`, `rand` | 4 |

**Total estimated time: 2-3 weeks**

---

## Phase 2: Audio Calls (VoIP Sidecar + WebRTC)

**Goal:** Actual audio transmission using a VoIP sidecar binary, following the existing STT sidecar pattern.

### 2.1 VoIP Sidecar Binary

**New directory:** `src-tauri/voip-sidecar/`

**New file:** `src-tauri/voip-sidecar/Cargo.toml`
```toml
[package]
name = "voip-sidecar"
version = "0.1.0"
edition = "2021"

[dependencies]
webrtc = "0.12"            # Pure Rust WebRTC
opus = "0.3"               # Opus codec bindings
cpal = "0.15"              # Cross-platform audio I/O
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
clap = { version = "4.5", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

**New file:** `src-tauri/voip-sidecar/src/main.rs`
- Long-running process (not one-shot like STT sidecar)
- Communicates with main Tauri process via stdin/stdout JSON-line protocol
- Commands received on stdin:
  - `{ "cmd": "start", "connections": [...], "encryption_key": "...", "is_outgoing": bool }`
  - `{ "cmd": "mute", "muted": bool }`
  - `{ "cmd": "set_volume", "volume": float }`
  - `{ "cmd": "stop" }`
- Events emitted on stdout:
  - `{ "event": "connected" }`
  - `{ "event": "audio_level", "level": float }`
  - `{ "event": "network_quality", "quality": int }`
  - `{ "event": "error", "message": "..." }`
  - `{ "event": "stopped" }`

**New file:** `src-tauri/voip-sidecar/src/otp_transport.rs`
- WebRTC peer connection setup
- Parse `PhoneConnection` / `PhoneConnectionWebrtc` into ICE candidates
- STUN/TURN configuration from Telegram-provided endpoints
- DTLS-SRTP for media encryption

**New file:** `src-tauri/voip-sidecar/src/audio.rs`
- `cpal` audio capture (microphone) -> Opus encode -> send via WebRTC
- Receive WebRTC audio -> Opus decode -> `cpal` playback (speaker)
- Audio resampling if needed (Opus uses 48kHz)
- Echo cancellation (basic, or rely on OS)

**New file:** `src-tauri/voip-sidecar/src/encryption.rs`
- Apply Telegram's encryption layer using the shared key from DH exchange
- SRTP key derivation from the DH shared key
- MTProto encryption for signaling data (`phone.sendSignalingData`)

**Estimated complexity:** High (3-4 weeks). WebRTC + audio is the hardest part.

### 2.2 Sidecar Management in Main App

**New file:** `src-tauri/src/commands/voip_sidecar.rs`
- Spawn `voip-sidecar` binary as child process
- Pipe stdin/stdout for IPC
- Forward signaling data between Telegram MTProto and sidecar
- Handle sidecar crash/restart

**Modify:** `src-tauri/src/commands/calls.rs`
- After `phone.confirmCall` succeeds and connections are available, launch VoIP sidecar
- Pass connections + encryption key to sidecar via stdin
- Forward `phone.sendSignalingData` updates to sidecar
- Forward sidecar's signaling data back to Telegram via `phone.sendSignalingData`

**New Tauri commands:**
```rust
#[tauri::command]
async fn toggle_call_mute(call_id: i64, muted: bool) -> Result<(), String>

#[tauri::command]
async fn set_call_volume(call_id: i64, volume: f32) -> Result<(), String>

#[tauri::command]
async fn get_call_audio_devices() -> Result<Vec<AudioDevice>, String>

#[tauri::command]
async fn set_call_audio_device(device_id: String, kind: String) -> Result<(), String>
```

**Estimated complexity:** Medium (1-2 weeks).

### 2.3 Tauri Build Configuration

**Modify:** `src-tauri/Cargo.toml` (workspace or build script)
- Build VoIP sidecar alongside main binary
- Bundle sidecar in Tauri resources

**Modify:** `src-tauri/tauri.conf.json`
- Add VoIP sidecar to `externalBin` (same pattern as STT sidecar if configured)

**Estimated complexity:** Low (1-2 days).

### 2.4 Frontend: Audio Call Controls

**Modify:** `src/components/Call/InCallScreen.tsx`
- Wire mute button to `toggle_call_mute` command
- Wire speaker button to audio output device switching
- Show audio level indicator (animated bars)
- Show network quality indicator (dots/bars)
- Display call duration timer (real-time)

**Modify:** `src/store/callStore.ts`
- Add `isMuted`, `volume`, `networkQuality`, `audioLevel` state
- Listen for sidecar events forwarded via Tauri events
- `telegram:call-audio-level`, `telegram:call-network-quality`

**New i18n keys:**
- `call_poor_connection` / `call_reconnecting`
- `call_audio_device_speaker` / `call_audio_device_headphones`

**Estimated complexity:** Low-Medium (1 week).

### Phase 2 Summary

| Category | Files | Count |
|----------|-------|-------|
| New Rust files | `voip-sidecar/` (4+ files), `commands/voip_sidecar.rs` | 5+ |
| Modified Rust files | `commands/calls.rs`, `commands/mod.rs`, `lib.rs`, `Cargo.toml` | 4 |
| Modified TS files | `InCallScreen.tsx`, `callStore.ts`, `i18n/locales/*.ts` | 4 |
| New crates (sidecar) | `webrtc`, `opus`, `cpal` | 3 |

**Total estimated time: 6-8 weeks**
**Depends on:** Phase 1 complete

---

## Phase 3: Video Calls & Advanced Features

**Goal:** Video support, screen sharing, group calls.

### 3.1 Video Capture & Rendering

**Modify:** `src-tauri/voip-sidecar/Cargo.toml`
```toml
# Add video dependencies
nokhwa = "0.10"            # Cross-platform camera access
vpx-sys = "0.3"            # VP8/VP9 codec (or use webrtc crate's built-in)
```

**Modify:** `src-tauri/voip-sidecar/src/main.rs`
- Add video commands: `{ "cmd": "enable_video", "enabled": bool, "camera_id": "..." }`
- Video frame pipeline: camera -> VP8/VP9 encode -> WebRTC video track

**New file:** `src-tauri/voip-sidecar/src/video.rs`
- Camera enumeration and capture via `nokhwa`
- VP8/VP9 encoding
- Frame rate control (15/30 fps based on quality setting)
- Resolution adaptation based on bandwidth

**Frontend video rendering approach:**
Since the sidecar runs as a separate process, we have two options for video:
1. **Shared memory + canvas:** Sidecar writes frames to shared memory, Tauri reads and sends to frontend as base64/ImageData
2. **WebRTC in browser:** If we can get WebRTC to run in the webview directly (using browser's built-in WebRTC), this is much simpler for video rendering
3. **HTTP streaming:** Sidecar serves MJPEG/HLS on localhost, frontend displays in `<video>` tag

**Recommended: Option 2 (Browser WebRTC) for video.** The sidecar handles Telegram protocol negotiation and key exchange, then hands off the actual WebRTC session parameters to the browser. The browser's native WebRTC handles video capture, encoding, and rendering. This avoids the complexity of piping video frames through Tauri IPC.

**New file:** `src/components/Call/VideoCallScreen.tsx`
- Remote video: `<video>` element with `srcObject` from `RTCPeerConnection`
- Local video preview: small PiP overlay
- Toggle camera button
- Flip camera button (mobile)
- Fullscreen toggle

**New file:** `src/components/Call/VideoCallScreen.css`
- PiP positioning (draggable)
- Fullscreen layout
- Video fade-in/out transitions

**Estimated complexity:** High (3-4 weeks).

### 3.2 Screen Sharing

**Modify:** `src/components/Call/InCallScreen.tsx` / `VideoCallScreen.tsx`
- Screen share button
- Uses `navigator.mediaDevices.getDisplayMedia()` in browser WebRTC approach
- Replace outgoing video track with screen capture stream
- Show "You are sharing your screen" indicator

**New Tauri command (if needed):**
```rust
#[tauri::command]
async fn get_screen_sources() -> Result<Vec<ScreenSource>, String>
```
- May need `tauri-plugin-screen-capture` or similar

**Estimated complexity:** Medium (1-2 weeks). Browser API does most of the heavy lifting.

### 3.3 Group Calls (Separate Protocol)

Group calls use a completely different Telegram protocol from 1-on-1 calls.

**Key differences:**
- Uses `phone.createGroupCall`, `phone.joinGroupCall`, `phone.leaveGroupCall`
- Server-side mixing (SFU), not peer-to-peer
- `InputGroupCall` identified by `id + access_hash` or `slug`
- Participants tracked via `updateGroupCallParticipants`
- Connection params via `updateGroupCallConnection` (DataJSON with SDP)
- Supports presentation mode (`joinGroupCallPresentation`)
- Conference calls (new in recent TL): `messageActionConferenceCall`

**New file:** `src-tauri/src/telegram/group_call_state.rs`
- `GroupCallInfo` struct
- Participant tracking
- Connection state

**New file:** `src-tauri/src/commands/group_calls.rs`
```rust
#[tauri::command]
async fn create_group_call(account_id: String, chat_id: i64) -> Result<GroupCallInfo, String>

#[tauri::command]
async fn join_group_call(account_id: String, call_id: i64, muted: bool) -> Result<(), String>

#[tauri::command]
async fn leave_group_call(account_id: String, call_id: i64) -> Result<(), String>

#[tauri::command]
async fn toggle_group_call_mute(account_id: String, call_id: i64, muted: bool) -> Result<(), String>
```

**New file:** `src/components/Call/GroupCallScreen.tsx`
- Participant grid (like Zoom/Google Meet)
- Speaking indicators per participant
- Mute/unmute controls
- Hand raise
- Participant list sidebar

**New file:** `src/store/groupCallStore.ts`
- Participants list with audio/video state
- Speaking detection
- Connection state

**Estimated complexity:** Very High (4-6 weeks). Entirely separate protocol and UI.

### 3.4 Call Quality Settings

**Modify:** `src/components/Settings/` (new section)
- Preferred audio codec
- Video quality preset (low/medium/high)
- Data saving mode (`phonecalls_less_data` from `autoDownloadSettings`)
- Default audio input/output device
- Noise suppression toggle

**New file:** `src-tauri/src/commands/call_settings.rs`
- Persist call preferences to local storage/SQLite

**Estimated complexity:** Low (1 week).

### Phase 3 Summary

| Category | Files | Count |
|----------|-------|-------|
| New Rust files | `telegram/group_call_state.rs`, `commands/group_calls.rs`, `commands/call_settings.rs`, `voip-sidecar/src/video.rs` | 4 |
| Modified Rust files | `voip-sidecar/main.rs`, `voip-sidecar/Cargo.toml`, `commands/mod.rs`, `lib.rs`, `updates.rs` | 5 |
| New TS files | `VideoCallScreen.tsx`, `GroupCallScreen.tsx`, `groupCallStore.ts`, + CSS files | 5+ |
| Modified TS files | `InCallScreen.tsx`, `callStore.ts`, Settings components, `i18n/locales/*.ts` | 5+ |
| New crates (sidecar) | `nokhwa` (camera) | 1 |

**Total estimated time: 8-12 weeks**
**Depends on:** Phase 2 complete

---

## Dependency Graph

```
Phase 1 (Signal Layer)
  |
  +-- DH key exchange (dh.rs)
  |     |
  +-- Call state machine (call_state.rs)
  |     |
  +-- Tauri commands (commands/calls.rs)
  |     |
  +-- Update handler (updates.rs modifications)
  |     |
  +-- Frontend call store + UI components
  |
Phase 2 (Audio)
  |
  +-- VoIP sidecar binary (voip-sidecar/)
  |     |
  +-- Sidecar IPC management (voip_sidecar.rs)
  |     |
  +-- Audio capture/playback (cpal)
  |     |
  +-- WebRTC transport (webrtc crate)
  |     |
  +-- Frontend audio controls
  |
Phase 3 (Video + Advanced)
  |
  +-- Video capture in sidecar or browser WebRTC
  |     |
  +-- Screen sharing
  |     |
  +-- Group calls (independent sub-project)
  |     |
  +-- Call quality settings
```

---

## Risk Assessment

### Phase 1 Risks (Low)
- **grammers raw update access:** Need to verify that `Update::Raw` or similar gives us access to `updatePhoneCall`. If not, may need to fork grammers or use a workaround.
- **DH parameter validation:** Must correctly validate `g_a` and `g_b` per Telegram's security requirements, otherwise calls will fail.

### Phase 2 Risks (High)
- **webrtc-rs maturity:** The pure Rust WebRTC crate may have gaps compared to Google's libwebrtc. Telegram's VoIP may use features not yet implemented.
- **Audio latency:** cpal -> Opus -> WebRTC pipeline needs to achieve <150ms round-trip latency for good call quality.
- **NAT traversal:** Some network configurations may require TURN relay, which adds complexity.
- **Telegram protocol compatibility:** The `library_versions` field in `PhoneCallProtocol` must match what Telegram expects. May need reverse-engineering of the exact version negotiation.

### Phase 3 Risks (Medium-High)
- **Video performance:** Encoding/decoding video in a sidecar with IPC overhead may be too slow. Browser WebRTC approach is preferred but requires bridging Telegram's connection params to standard WebRTC.
- **Group calls:** Entirely different protocol, essentially a separate project. SFU-based, may require understanding of Telegram's proprietary extensions.

---

## Alternative Approach: ntgcalls FFI

Instead of building VoIP from scratch with webrtc-rs, consider wrapping `ntgcalls` (C++ Telegram VoIP library) via FFI:

**Pros:**
- Battle-tested, handles all Telegram VoIP edge cases
- Correct protocol implementation guaranteed
- Handles both 1-on-1 and group calls

**Cons:**
- C++ build dependency (cmake, platform-specific toolchains)
- FFI boundary complexity
- Harder to debug
- May not compile easily for all Tauri targets

**If chosen:** Create `src-tauri/voip-sidecar/` as a C++ project with Rust FFI bindings instead of pure Rust. Use `cc` or `cmake` crate in build.rs.

---

## Quick Start: Phase 1 First Steps

1. Add `num-bigint`, `num-traits`, `num-integer`, `rand` to `src-tauri/Cargo.toml`
2. Create `src-tauri/src/telegram/dh.rs` with DH key exchange
3. Create `src-tauri/src/telegram/call_state.rs` with state machine
4. Create `src-tauri/src/commands/calls.rs` with `request_call` command
5. Test: Call yourself from another Telegram client, verify `updatePhoneCall` arrives
6. Verify the phone rings on the other side when `phone.requestCall` is sent

---

## References

- Telegram Voice Call Protocol: https://core.telegram.org/api/end-to-end/voice-calls
- Telegram DH Key Exchange: https://core.telegram.org/api/end-to-end
- TL Schema (phone methods): grammers-tl-types api.tl lines 2691-2720
- TL Schema (phone types): grammers-tl-types api.tl lines 977-989
- tgcalls source: https://github.com/AoD314/tgcalls
- ntgcalls: https://github.com/AoD314/ntgcalls
- webrtc-rs: https://github.com/webrtc-rs/webrtc
- Existing STT sidecar (reference pattern): `src-tauri/stt-sidecar/`

# Telegram Audio/Video Calls - Implementation Plan

## Status: Not Yet Feasible (Placeholder UI Added)

## What Works Now
- `grammers-tl-types 0.8` includes all phone call TL types:
  - `phone.requestCall`, `phone.acceptCall`, `phone.confirmCall`, `phone.discardCall`
  - `phone.receivedCall`, `phone.sendSignalingData`, `phone.setCallRating`
  - `PhoneCall` (all variants: Empty, Waiting, Requested, Accepted, full, Discarded)
  - `PhoneCallProtocol`, `PhoneConnection`, `PhoneConnectionWebrtc`
  - `InputPhoneCall`, `PhoneCallDiscardReason`
  - `updatePhoneCall`, `updatePhoneCallSignalingData`
- `grammers-client` supports raw `client.invoke()` to call any TL function
- Signal layer (call setup/teardown via MTProto) is fully achievable

## What's Missing for Full Implementation

### 1. Diffie-Hellman Key Exchange
- Telegram calls require DH key exchange for end-to-end encryption
- Need to generate `g_a` (caller) and `g_b` (callee) parameters
- Compute shared key and verify key fingerprint
- Requires bignum arithmetic (e.g., `num-bigint` crate)

### 2. VoIP / Media Transport Layer
- After call setup, actual audio/video goes over UDP (not MTProto)
- Telegram uses `PhoneConnection` (raw UDP) or `PhoneConnectionWebrtc` (WebRTC)
- Need a WebRTC implementation or custom UDP transport
- Options:
  - **webrtc-rs** (pure Rust WebRTC) - most promising for Tauri
  - **libwebrtc** (Google's C++ impl) via FFI - mature but complex build
  - **libtgvoip** / **tgcalls** (Telegram's own C++ VoIP lib) - most compatible

### 3. Audio/Video Codec Handling
- Audio: Opus codec (encode/decode)
- Video: VP8 or VP9 codec
- Need audio capture (microphone) and playback (speaker)
- Need video capture (camera) and rendering
- Platform-specific audio/video device access

### 4. NAT Traversal
- STUN/TURN server communication for UDP hole punching
- ICE candidate gathering and exchange
- Telegram provides STUN/TURN endpoints via `PhoneConnectionWebrtc`

### 5. Encryption Layer
- After DH exchange, all media packets must be encrypted
- Telegram uses a custom encryption scheme on top of the transport

## Recommended Implementation Phases

### Phase 1: Signal Layer Only (Weeks)
- Implement DH key exchange in Rust
- Send/receive call signaling via `client.invoke()`
- Handle `updatePhoneCall` to track call state
- Can ring the other party but no actual media
- Useful for: initiating calls that ring on the other party's device

### Phase 2: WebRTC Integration (Months)
- Integrate `webrtc-rs` or `libwebrtc`
- Extract STUN/TURN credentials from `PhoneConnectionWebrtc`
- Establish peer-to-peer media connection
- Audio-only calls first

### Phase 3: Full Media Support (Months)
- Add video call support
- Camera capture and rendering in Tauri webview
- Screen sharing
- Group calls (completely separate protocol)

## Alternative Approaches

### A. Use tgcalls/ntgcalls via FFI
- Telegram's own C++ VoIP library handles all the complexity
- `ntgcalls` (Node.js bindings exist) could be adapted
- Pros: battle-tested, handles all edge cases
- Cons: C++ dependency, complex cross-platform build

### B. Use tdlib for Calls
- TDLib has partial call support (signal layer)
- Still doesn't handle media transport itself
- Would require switching from grammers to tdlib (breaking change)

### C. External VoIP Bridge
- Run a separate process that handles VoIP
- Communicate via IPC/stdin/stdout (like the STT sidecar pattern)
- Could wrap tgcalls in a sidecar binary

## Current State
- Placeholder call buttons added to ChatHeader (disabled, with "coming soon" tooltip)
- i18n translations added for all call-related strings
- No backend call commands yet (will be added in Phase 1)

## Dependencies to Add (When Ready)
```toml
# For DH key exchange
num-bigint = "0.4"
num-traits = "0.2"
rand = "0.8"

# For WebRTC (Phase 2)
# webrtc = "0.9"  # or libwebrtc bindings
```

## References
- Telegram Call Protocol: https://core.telegram.org/api/end-to-end/voice-calls
- TL Schema phone methods: grammers-tl-types api.tl lines 2691-2720
- tgcalls source: https://github.com/AoD314/tgcalls
- ntgcalls: https://github.com/AoD314/ntgcalls
- webrtc-rs: https://github.com/webrtc-rs/webrtc

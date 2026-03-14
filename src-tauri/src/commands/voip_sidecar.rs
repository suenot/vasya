//! VoIP sidecar process management

use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde::{Deserialize, Serialize};

/// Sidecar command to send via stdin
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum SidecarCommand {
    Start {
        connections: Vec<SidecarConnection>,
        encryption_key: String,
        is_outgoing: bool,
        key_fingerprint: i64,
    },
    Stop,
    Mute { muted: bool },
    SetVolume { volume: f32 },
    SignalingData { data: Vec<u8> },
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarConnection {
    pub id: i64,
    pub ip: String,
    pub ipv6: String,
    pub port: i32,
    pub peer_tag: Vec<u8>,
}

/// Sidecar event received via stdout
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum SidecarEvent {
    Ready,
    Connecting,
    Connected,
    Stopped { reason: String },
    AudioLevel { level: f32 },
    NetworkQuality { quality: u8 },
    MuteChanged { muted: bool },
    VolumeChanged { volume: f32 },
    SignalingDataOut { data: Vec<u8> },
    Error { message: String },
    CommandReceived { cmd: String },
}

/// VoIP sidecar process handle
pub struct VoipSidecarHandle {
    child: tauri_plugin_shell::process::CommandChild,
}

impl VoipSidecarHandle {
    /// Send a command to the sidecar via stdin
    pub fn send_command(&mut self, cmd: &SidecarCommand) -> Result<(), String> {
        let json = serde_json::to_string(cmd)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;
        self.child.write((json + "\n").as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        Ok(())
    }

    /// Kill the sidecar process
    pub fn kill(self) -> Result<(), String> {
        self.child.kill()
            .map_err(|e| format!("Failed to kill sidecar: {}", e))
    }
}

/// Spawn the VoIP sidecar and start listening for events
pub async fn spawn_voip_sidecar(
    app: &AppHandle,
) -> Result<VoipSidecarHandle, String> {
    let sidecar_command = app
        .shell()
        .sidecar("voip-sidecar")
        .map_err(|e| format!("VoIP sidecar not found: {}", e))?;

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn VoIP sidecar: {}", e))?;

    let app_clone = app.clone();

    // Spawn event listener
    tokio::spawn(async move {
        let mut stdout_buf = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    let text = String::from_utf8_lossy(&data);
                    stdout_buf.push_str(&text);

                    // Process complete lines
                    while let Some(newline_pos) = stdout_buf.find('\n') {
                        let line = stdout_buf[..newline_pos].trim().to_string();
                        stdout_buf = stdout_buf[newline_pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<SidecarEvent>(&line) {
                            Ok(sidecar_event) => {
                                handle_sidecar_event(&app_clone, &sidecar_event);
                            }
                            Err(e) => {
                                tracing::warn!("Failed to parse sidecar event: {} (line: {})", e, line);
                            }
                        }
                    }
                }
                CommandEvent::Stderr(data) => {
                    let text = String::from_utf8_lossy(&data);
                    tracing::debug!("[voip-sidecar stderr] {}", text.trim());
                }
                CommandEvent::Terminated(payload) => {
                    tracing::info!("VoIP sidecar terminated with code: {:?}", payload.code);
                    let _ = app_clone.emit("telegram:call-sidecar-stopped", serde_json::json!({
                        "code": payload.code
                    }));
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(VoipSidecarHandle { child })
}

/// Handle events from the VoIP sidecar
fn handle_sidecar_event(app: &AppHandle, event: &SidecarEvent) {
    match event {
        SidecarEvent::Ready => {
            tracing::info!("VoIP sidecar ready");
        }
        SidecarEvent::Connecting => {
            let _ = app.emit("telegram:call-connecting", serde_json::json!({}));
        }
        SidecarEvent::Connected => {
            tracing::info!("VoIP sidecar connected - audio flowing");
            let _ = app.emit("telegram:call-connected", serde_json::json!({}));
        }
        SidecarEvent::AudioLevel { level } => {
            let _ = app.emit("telegram:call-audio-level", serde_json::json!({ "level": level }));
        }
        SidecarEvent::NetworkQuality { quality } => {
            let _ = app.emit("telegram:call-network-quality", serde_json::json!({ "quality": quality }));
        }
        SidecarEvent::SignalingDataOut { data } => {
            // TODO: Forward to Telegram via phone.sendSignalingData
            tracing::debug!("Sidecar wants to send {} bytes of signaling data", data.len());
        }
        SidecarEvent::Stopped { reason } => {
            tracing::info!("VoIP sidecar stopped: {}", reason);
            let _ = app.emit("telegram:call-sidecar-stopped", serde_json::json!({ "reason": reason }));
        }
        SidecarEvent::Error { message } => {
            tracing::error!("VoIP sidecar error: {}", message);
            let _ = app.emit("telegram:call-error", serde_json::json!({ "message": message }));
        }
        _ => {}
    }
}

//! Speech-to-text commands
//!
//! Supports two providers:
//! - Deepgram (cloud, default) — sends audio to Deepgram Nova-2 API
//! - Local Whisper (via sidecar binary) — runs whisper.cpp locally

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

/// STT provider selection
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SttProvider {
    Deepgram,
    LocalWhisper,
}

impl Default for SttProvider {
    fn default() -> Self {
        SttProvider::Deepgram
    }
}

/// Persisted STT settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttSettings {
    pub provider: SttProvider,
    pub deepgram_api_key: Option<String>,
    pub whisper_model: String, // "tiny", "base", "small"
    pub language: String,
}

impl Default for SttSettings {
    fn default() -> Self {
        Self {
            provider: SttProvider::Deepgram,
            deepgram_api_key: None,
            whisper_model: "small".to_string(),
            language: "ru".to_string(),
        }
    }
}

/// Transcription result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub cached: bool,
}

// --- Settings persistence ---

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(dir.join("stt_settings.json"))
}

fn transcriptions_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(dir.join("transcriptions"))
}

fn load_settings(app: &AppHandle) -> SttSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return SttSettings::default(),
    };
    if !path.exists() {
        return SttSettings::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => SttSettings::default(),
    }
}

fn save_settings(app: &AppHandle, settings: &SttSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))
}

// --- Tauri commands ---

#[tauri::command]
pub async fn get_stt_settings(app: AppHandle) -> Result<SttSettings, String> {
    let mut settings = load_settings(&app);
    // Fill in default Deepgram API key from env if not set
    if settings.deepgram_api_key.is_none() {
        settings.deepgram_api_key = std::env::var("DEEPGRAM_API_KEY").ok();
    }
    Ok(settings)
}

#[tauri::command]
pub async fn set_stt_settings(app: AppHandle, settings: SttSettings) -> Result<(), String> {
    save_settings(&app, &settings)?;
    tracing::info!(provider = ?settings.provider, "STT settings updated");
    Ok(())
}

/// Transcribe a downloaded audio file.
/// Returns cached result if available; otherwise calls the configured STT provider.
#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    chat_id: i64,
    message_id: i32,
    file_path: String,
) -> Result<TranscriptionResult, String> {
    // Check disk cache first
    let cache_dir = transcriptions_dir(&app)?;
    let cache_file = cache_dir.join(format!("{}_{}.txt", chat_id, message_id));

    if cache_file.exists() {
        let text = tokio::fs::read_to_string(&cache_file)
            .await
            .map_err(|e| format!("Failed to read cache: {}", e))?;
        return Ok(TranscriptionResult {
            text,
            language: None,
            cached: true,
        });
    }

    let settings = load_settings(&app);

    let result = match settings.provider {
        SttProvider::Deepgram => transcribe_deepgram(&app, &file_path, &settings).await?,
        SttProvider::LocalWhisper => transcribe_whisper(&app, &file_path, &settings).await?,
    };

    // Save to disk cache
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("Failed to create transcription cache dir: {}", e))?;
    let _ = tokio::fs::write(&cache_file, &result.text).await;

    tracing::info!(
        chat_id = chat_id,
        message_id = message_id,
        provider = ?settings.provider,
        text_len = result.text.len(),
        "Audio transcribed"
    );

    Ok(result)
}

// --- Deepgram provider ---

#[derive(Deserialize)]
struct DeepgramResponse {
    results: Option<DeepgramResults>,
}

#[derive(Deserialize)]
struct DeepgramResults {
    channels: Vec<DeepgramChannel>,
}

#[derive(Deserialize)]
struct DeepgramChannel {
    alternatives: Vec<DeepgramAlternative>,
}

#[derive(Deserialize)]
struct DeepgramAlternative {
    transcript: String,
}

async fn transcribe_deepgram(
    _app: &AppHandle,
    file_path: &str,
    settings: &SttSettings,
) -> Result<TranscriptionResult, String> {
    let api_key = settings
        .deepgram_api_key
        .clone()
        .or_else(|| std::env::var("DEEPGRAM_API_KEY").ok())
        .ok_or("Deepgram API key not configured")?;

    let audio_data = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Detect content type from extension
    let content_type = if file_path.ends_with(".ogg") || file_path.ends_with(".oga") {
        "audio/ogg"
    } else if file_path.ends_with(".mp3") {
        "audio/mpeg"
    } else if file_path.ends_with(".wav") {
        "audio/wav"
    } else {
        "audio/ogg" // Telegram voice messages default
    };

    let lang = &settings.language;
    let url = format!(
        "https://api.deepgram.com/v1/listen?model=nova-2&language={}&smart_format=true&punctuate=true",
        lang
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Token {}", api_key))
        .header("Content-Type", content_type)
        .body(audio_data)
        .send()
        .await
        .map_err(|e| format!("Deepgram request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Deepgram API error {}: {}", status, body));
    }

    let resp: DeepgramResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Deepgram response: {}", e))?;

    let text = resp
        .results
        .and_then(|r| r.channels.into_iter().next())
        .and_then(|c| c.alternatives.into_iter().next())
        .map(|a| a.transcript)
        .unwrap_or_default();

    Ok(TranscriptionResult {
        text,
        language: Some(lang.clone()),
        cached: false,
    })
}

// --- Local Whisper provider (via sidecar) ---

async fn transcribe_whisper(
    app: &AppHandle,
    file_path: &str,
    settings: &SttSettings,
) -> Result<TranscriptionResult, String> {
    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("whisper-models");

    let model_path = model_dir.join(format!("ggml-{}.bin", settings.whisper_model));

    if !model_path.exists() {
        return Err(format!(
            "Whisper model '{}' not downloaded. Go to Settings > STT to download it.",
            settings.whisper_model
        ));
    }

    // Run sidecar binary
    let sidecar_command = app
        .shell()
        .sidecar("stt-sidecar")
        .map_err(|e| format!("Whisper sidecar not found: {}. Local STT is not yet installed.", e))?;

    let output = sidecar_command
        .args(&[
            "--model",
            model_path.to_str().unwrap_or(""),
            "--input",
            file_path,
            "--language",
            &settings.language,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run whisper sidecar: {}", e))?;

    if output.status.code() != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper sidecar failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    #[derive(Deserialize)]
    struct WhisperOutput {
        text: String,
        language: Option<String>,
    }

    let parsed: WhisperOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse whisper output: {}", e))?;

    Ok(TranscriptionResult {
        text: parsed.text,
        language: parsed.language,
        cached: false,
    })
}

/// Download a Whisper model from Hugging Face
#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    model_name: String,
) -> Result<String, String> {
    let valid_models = ["tiny", "base", "small"];
    if !valid_models.contains(&model_name.as_str()) {
        return Err(format!("Invalid model: {}. Use one of: {:?}", model_name, valid_models));
    }

    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("whisper-models");

    tokio::fs::create_dir_all(&model_dir)
        .await
        .map_err(|e| format!("Failed to create model dir: {}", e))?;

    let dest = model_dir.join(format!("ggml-{}.bin", model_name));
    if dest.exists() {
        return Ok("Model already downloaded".to_string());
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
        model_name
    );

    tracing::info!(model = %model_name, url = %url, "Downloading whisper model");

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    tokio::fs::write(&dest, &bytes)
        .await
        .map_err(|e| format!("Failed to save model: {}", e))?;

    let size_mb = bytes.len() as f64 / (1024.0 * 1024.0);
    tracing::info!(model = %model_name, size_mb = size_mb, "Whisper model downloaded");

    Ok(format!("Downloaded {} ({:.1} MB)", model_name, size_mb))
}

/// Check which Whisper models are downloaded
#[tauri::command]
pub async fn get_whisper_models_status(app: AppHandle) -> Result<Vec<(String, bool, Option<u64>)>, String> {
    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("whisper-models");

    let models = vec!["tiny", "base", "small"];
    let mut result = Vec::new();

    for name in models {
        let path = model_dir.join(format!("ggml-{}.bin", name));
        let (exists, size) = if path.exists() {
            let meta = tokio::fs::metadata(&path).await.ok();
            (true, meta.map(|m| m.len()))
        } else {
            (false, None)
        };
        result.push((name.to_string(), exists, size));
    }

    Ok(result)
}

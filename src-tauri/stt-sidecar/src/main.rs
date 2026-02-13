//! STT Sidecar: Local Whisper.cpp transcription
//!
//! CLI tool that loads a whisper model and transcribes audio files.
//! Outputs JSON to stdout for easy parsing by the main app.

use clap::Parser;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Parser, Debug)]
#[command(name = "stt-sidecar")]
#[command(about = "Local Whisper.cpp STT sidecar")]
struct Args {
    /// Path to the GGML model file (e.g., ggml-small.bin)
    #[arg(long)]
    model: PathBuf,

    /// Path to the audio file to transcribe (WAV/MP3/OGG/etc.)
    #[arg(long)]
    input: PathBuf,

    /// Language code (ru, en, uk, etc.) or "auto"
    #[arg(long, default_value = "auto")]
    language: String,
}

#[derive(Serialize, Deserialize)]
struct Output {
    text: String,
    language: Option<String>,
}

fn main() {
    let args = Args::parse();

    match run_transcription(&args) {
        Ok(output) => {
            println!("{}", serde_json::to_string(&output).unwrap());
            std::process::exit(0);
        }
        Err(err) => {
            eprintln!("Error: {}", err);
            std::process::exit(1);
        }
    }
}

fn run_transcription(args: &Args) -> Result<Output, String> {
    // Load whisper model
    let ctx = WhisperContext::new_with_params(
        &args.model.to_string_lossy(),
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("Failed to load whisper model: {}", e))?;

    // Convert audio to 16kHz mono WAV (whisper requirement)
    let audio_data = convert_audio_to_pcm(&args.input)?;

    // Set up transcription parameters
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // Set language (if not auto)
    if args.language != "auto" && args.language != "multi" {
        params.set_language(Some(&args.language));
    }

    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Create state
    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create whisper state: {}", e))?;

    // Run transcription
    state
        .full(params, &audio_data)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    // Extract text
    let num_segments = state
        .full_n_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))?;

    let mut full_text = String::new();
    for i in 0..num_segments {
        let segment = state
            .full_get_segment_text(i)
            .map_err(|e| format!("Failed to get segment {}: {}", i, e))?;
        full_text.push_str(&segment);
        full_text.push(' ');
    }

    let text = full_text.trim().to_string();

    // Detect language (whisper auto-detects)
    let detected_lang = if args.language == "auto" || args.language == "multi" {
        // whisper-rs doesn't expose detected language in current API,
        // so we just return None for now
        None
    } else {
        Some(args.language.clone())
    };

    Ok(Output {
        text,
        language: detected_lang,
    })
}

/// Convert audio file to 16kHz mono PCM f32 samples (required by whisper)
fn convert_audio_to_pcm(input_path: &PathBuf) -> Result<Vec<f32>, String> {
    // For simplicity, we expect the audio to already be in a compatible format.
    // In production, you'd use ffmpeg or a Rust audio library (symphonia, hound, etc.)
    // to resample and convert to mono 16kHz.

    // Placeholder: read raw WAV assuming 16kHz mono (this will NOT work for MP3/OGG/etc.)
    // A real implementation would use symphonia or call ffmpeg via Command.

    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(input_path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Minimal WAV parser: skip 44-byte header, read PCM as i16, convert to f32
    if bytes.len() < 44 {
        return Err("Audio file too small (not a valid WAV)".to_string());
    }

    // Check RIFF header
    if &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Audio file is not a valid WAV (use ffmpeg to convert)".to_string());
    }

    // Read PCM data (skip 44-byte header)
    let pcm_bytes = &bytes[44..];
    let samples_i16: Vec<i16> = pcm_bytes
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();

    // Convert i16 to f32 normalized to [-1.0, 1.0]
    let samples_f32: Vec<f32> = samples_i16
        .iter()
        .map(|&s| s as f32 / i16::MAX as f32)
        .collect();

    Ok(samples_f32)
}

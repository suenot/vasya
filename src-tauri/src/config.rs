//! Configuration module for Telegram spy service.

use anyhow::{Context, Result};
use serde::{Deserialize, Deserializer, Serialize};
use std::path::Path;

/// Deserialize a value that can be either a number or a string containing a number
fn deserialize_number_or_string<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: std::str::FromStr + serde::Deserialize<'de>,
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    use serde::de::Error;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber<T> {
        String(String),
        Number(T),
    }

    match StringOrNumber::<T>::deserialize(deserializer)? {
        StringOrNumber::String(s) => s.parse::<T>().map_err(|e| {
            Error::custom(format!("Failed to parse '{}': {}", s, e))
        }),
        StringOrNumber::Number(n) => Ok(n),
    }
}

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub telegram: TelegramConfig,
    #[serde(default)]
    pub redis: Option<RedisConfig>,
    #[serde(default)]
    pub grpc: Option<GrpcConfig>,
    #[serde(default)]
    pub notification: NotificationConfig,
    #[serde(default)]
    pub processing: ProcessingConfig,
}

/// Telegram-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramConfig {
    /// Telegram API ID from https://my.telegram.org
    #[serde(deserialize_with = "deserialize_number_or_string")]
    pub api_id: i32,
    /// Telegram API hash from https://my.telegram.org
    pub api_hash: String,
    /// Phone number for authentication (format: +1234567890)
    pub phone: String,
    /// List of channel IDs to monitor (negative numbers for channels/groups)
    /// Can be either a single channel_id or a list of channel_ids
    #[serde(default)]
    pub channel_id: Option<i64>,
    /// List of channel IDs to monitor (simple list, for backwards compatibility)
    #[serde(default)]
    pub channel_ids: Vec<i64>,
    /// List of channels with names (preferred way)
    #[serde(default)]
    pub channels: Vec<ChannelConfig>,
    /// Session file name
    #[serde(default = "default_session_name")]
    pub session_name: String,
    /// Enable polling mode
    #[serde(default = "default_true")]
    pub polling_enabled: bool,
    /// Enable real-time event subscription
    #[serde(default = "default_true")]
    pub subscribe_new_messages: bool,
    /// Polling window start second (0-59)
    #[serde(default = "default_polling_start")]
    pub polling_start_second: u8,
    /// Polling window end second (0-59)
    #[serde(default = "default_polling_end")]
    pub polling_end_second: u8,
    /// Polling interval in seconds
    #[serde(default = "default_polling_interval")]
    pub polling_interval_seconds: f64,
}

/// Channel configuration with name
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    /// Channel ID (negative for channels/supergroups)
    pub id: i64,
    /// Human-readable name for the channel (e.g., "dev", "prod", "upbit_kr")
    pub name: String,
    /// Whether this channel is enabled (default: true)
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl TelegramConfig {
    /// Get all channel IDs to monitor (combines channel_id, channel_ids, and channels)
    pub fn get_channel_ids(&self) -> Vec<i64> {
        let mut ids = Vec::new();

        // Add from channels list (preferred)
        for ch in &self.channels {
            if ch.enabled && !ids.contains(&ch.id) {
                ids.push(ch.id);
            }
        }

        // Add from channel_ids list
        for id in &self.channel_ids {
            if !ids.contains(id) {
                ids.push(*id);
            }
        }

        // Add single channel_id
        if let Some(id) = self.channel_id {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }

        ids
    }

    /// Get channel configs (with names)
    pub fn get_channels(&self) -> Vec<ChannelConfig> {
        let mut result = Vec::new();

        // Add from channels list
        for ch in &self.channels {
            if ch.enabled {
                result.push(ch.clone());
            }
        }

        // Add from channel_ids (generate names)
        for (i, id) in self.channel_ids.iter().enumerate() {
            if !result.iter().any(|c| c.id == *id) {
                result.push(ChannelConfig {
                    id: *id,
                    name: format!("channel_{}", i + 1),
                    enabled: true,
                });
            }
        }

        // Add single channel_id
        if let Some(id) = self.channel_id {
            if !result.iter().any(|c| c.id == id) {
                result.push(ChannelConfig {
                    id,
                    name: "default".to_string(),
                    enabled: true,
                });
            }
        }

        result
    }

    /// Get channel name by ID
    pub fn get_channel_name(&self, id: i64) -> String {
        // Check in channels list
        for ch in &self.channels {
            if ch.id == id || ch.id == -id || -ch.id == id {
                return ch.name.clone();
            }
        }
        // Fallback to ID
        format!("{}", id)
    }
}

/// Redis configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    /// Redis connection URL (e.g., redis://127.0.0.1:6379)
    #[serde(default = "default_redis_url")]
    pub url: String,
    /// Redis channel/key for publishing messages
    #[serde(default = "default_redis_channel")]
    pub channel: String,
    /// Use pub/sub mode (true) or list push mode (false)
    #[serde(default = "default_true")]
    pub pubsub_mode: bool,
    /// Max retries for Redis operations
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
}

/// Notification configuration for alerts
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotificationConfig {
    /// Telegram bot token for sending notifications
    #[serde(default)]
    pub bot_token: String,
    /// Chat ID for notifications
    #[serde(default)]
    pub chat_id: i64,
}

/// Processing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingConfig {
    /// Maximum age of message to process (in seconds)
    #[serde(default = "default_max_message_age")]
    pub max_message_age_seconds: u64,
    /// Message cache TTL for deduplication (in seconds)
    #[serde(default = "default_cache_ttl")]
    pub cache_ttl_seconds: u64,
    /// Maximum cache size for deduplication
    #[serde(default = "default_cache_size")]
    pub cache_max_size: usize,
}

/// gRPC configuration for sending messages to Python service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcConfig {
    /// Enable gRPC output
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// gRPC server host
    #[serde(default = "default_grpc_host")]
    pub host: String,
    /// gRPC server port
    #[serde(default = "default_grpc_port")]
    pub port: u16,
    /// API key for authentication
    #[serde(default)]
    pub api_key: String,
    /// City where spy is running
    #[serde(default)]
    pub city: String,
    /// IP address
    #[serde(default)]
    pub ip: String,
    /// Use bidirectional streaming (ultra-low latency mode)
    #[serde(default = "default_true")]
    pub use_streaming: bool,
    /// Max retries for failed sends
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
}

impl Default for GrpcConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            host: "localhost".to_string(),
            port: 50052,
            api_key: String::new(),
            city: String::new(),
            ip: String::new(),
            use_streaming: true,
            max_retries: 3,
        }
    }
}

impl Default for ProcessingConfig {
    fn default() -> Self {
        Self {
            max_message_age_seconds: 30,
            cache_ttl_seconds: 2592000, // 30 days
            cache_max_size: 10000,
        }
    }
}

// Default value functions
fn default_session_name() -> String {
    "telegram_spy.session".to_string()
}

fn default_true() -> bool {
    true
}

fn default_polling_start() -> u8 {
    1
}

fn default_polling_end() -> u8 {
    6
}

fn default_polling_interval() -> f64 {
    0.5
}

fn default_redis_url() -> String {
    "redis://127.0.0.1:6379".to_string()
}

fn default_redis_channel() -> String {
    "telegram_messages".to_string()
}

fn default_max_retries() -> u32 {
    3
}

fn default_max_message_age() -> u64 {
    30
}

fn default_cache_ttl() -> u64 {
    2592000
}

fn default_cache_size() -> usize {
    10000
}

fn default_grpc_host() -> String {
    "localhost".to_string()
}

fn default_grpc_port() -> u16 {
    50052
}

impl Config {
    /// Load configuration from a JSON5 file (supports comments)
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path.display()))?;

        // Expand environment variables
        let content = expand_env_vars(&content);

        // Parse as JSON5 (supports comments, trailing commas, etc.)
        let config: Config = json5::from_str(&content)
            .with_context(|| format!("Failed to parse config file: {}", path.display()))?;

        config.validate()?;
        Ok(config)
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        if self.telegram.api_id == 0 {
            anyhow::bail!("telegram.api_id must be set");
        }
        if self.telegram.api_hash.is_empty() {
            anyhow::bail!("telegram.api_hash must be set");
        }
        if self.telegram.phone.is_empty() {
            anyhow::bail!("telegram.phone must be set");
        }
        // Check that at least one channel is specified
        let channel_ids = self.telegram.get_channel_ids();
        if channel_ids.is_empty() {
            anyhow::bail!("At least one channel_id or channel_ids must be set");
        }
        if self.telegram.polling_start_second > 59 {
            anyhow::bail!("telegram.polling_start_second must be 0-59");
        }
        if self.telegram.polling_end_second > 59 {
            anyhow::bail!("telegram.polling_end_second must be 0-59");
        }
        if self.telegram.polling_interval_seconds <= 0.0 {
            anyhow::bail!("telegram.polling_interval_seconds must be positive");
        }
        // Check that at least one output is configured
        let has_redis = self.redis.as_ref().is_some();
        let has_grpc = self.grpc.as_ref().map(|g| g.enabled).unwrap_or(false);
        if !has_redis && !has_grpc {
            anyhow::bail!("At least one output (redis or grpc) must be configured");
        }
        Ok(())
    }
}

/// Expand environment variables in a string (${VAR} or $VAR format)
fn expand_env_vars(input: &str) -> String {
    let re = regex::Regex::new(r"\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)").unwrap();
    
    re.replace_all(input, |caps: &regex::Captures| {
        let var_name = caps.get(1).or(caps.get(2)).unwrap().as_str();
        std::env::var(var_name).unwrap_or_default()
    }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_env_vars() {
        std::env::set_var("TEST_VAR", "test_value");
        let result = expand_env_vars("value: ${TEST_VAR}");
        assert_eq!(result, "value: test_value");
    }
}






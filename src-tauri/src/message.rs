//! Message types for Telegram spy service.

use serde::{Deserialize, Serialize};

/// Telegram message structure for Redis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramMessage {
    /// Unique message ID
    pub message_id: String,
    /// Message text content
    pub message_text: String,
    /// Chat/Channel ID where message was received
    pub chat_id: i64,
    /// Timestamp when message was published (ms)
    pub published_at_ms: i64,
    /// Timestamp when message was detected (ms)
    pub detected_at_ms: i64,
    /// Source identifier (e.g., "rust_grammers")
    pub source: String,
    /// Detection method: "event", "polling", "manual"
    pub source_method: String,
    /// City where spy is running (optional)
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub city: String,
    /// IP address where spy is running (optional)
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub ip: String,
    /// Parser language: "rust", "python", or "cpp"
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub parser_language: String,
    /// Transport method: "grpc" or "redis"
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub transport: String,
    /// Parsed announcement type if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub announcement_type: Option<AnnouncementType>,
    /// Extracted symbol if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    /// Extracted coin name if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coin_name: Option<String>,
}

impl TelegramMessage {
    /// Create a new TelegramMessage
    pub fn new(
        message_id: impl Into<String>,
        message_text: impl Into<String>,
        chat_id: i64,
        published_at_ms: i64,
        source_method: impl Into<String>,
    ) -> Self {
        Self {
            message_id: message_id.into(),
            message_text: message_text.into(),
            chat_id,
            published_at_ms,
            detected_at_ms: chrono::Utc::now().timestamp_millis(),
            source: "rust_grammers".to_string(),
            source_method: source_method.into(),
            city: String::new(),
            ip: String::new(),
            parser_language: "rust".to_string(),
            transport: String::new(), // Will be set by sender
            announcement_type: None,
            symbol: None,
            coin_name: None,
        }
    }

    /// Set city and IP for this message
    pub fn with_location(mut self, city: String, ip: String) -> Self {
        self.city = city;
        self.ip = ip;
        self
    }

    /// Set transport method for this message (grpc or redis)
    pub fn with_transport(mut self, transport: impl Into<String>) -> Self {
        self.transport = transport.into();
        self
    }

    /// Set announcement info for this message
    pub fn with_announcement(
        mut self,
        announcement_type: AnnouncementType,
        symbol: Option<String>,
        coin_name: Option<String>,
    ) -> Self {
        self.announcement_type = Some(announcement_type);
        self.symbol = symbol;
        self.coin_name = coin_name;
        self
    }

    /// Calculate latency from publication to detection (ms)
    pub fn latency_ms(&self) -> i64 {
        self.detected_at_ms - self.published_at_ms
    }

    /// Get message age in seconds
    pub fn age_seconds(&self) -> f64 {
        let now = chrono::Utc::now().timestamp_millis();
        (now - self.published_at_ms) as f64 / 1000.0
    }
}

/// Type of announcement detected
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnnouncementType {
    /// New listing announcement
    Listing,
    /// Delisting announcement
    Delisting,
    /// Warning/caution announcement
    Warning,
    /// Other trading-related announcement
    Other,
    /// Non-trading message
    NonSignal,
}

impl std::fmt::Display for AnnouncementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AnnouncementType::Listing => write!(f, "listing"),
            AnnouncementType::Delisting => write!(f, "delisting"),
            AnnouncementType::Warning => write!(f, "warning"),
            AnnouncementType::Other => write!(f, "other"),
            AnnouncementType::NonSignal => write!(f, "non_signal"),
        }
    }
}

/// Notification message for alerts
#[derive(Debug, Clone, Serialize)]
pub struct NotificationMessage {
    pub chat_id: i64,
    pub text: String,
    pub parse_mode: String,
}

impl NotificationMessage {
    pub fn html(chat_id: i64, text: impl Into<String>) -> Self {
        Self {
            chat_id,
            text: text.into(),
            parse_mode: "HTML".to_string(),
        }
    }
}


//! Telegram module for handling Telegram API interactions

pub mod auth;
pub mod client_manager;

pub use auth::{AuthToken, UserInfo};
pub use client_manager::TelegramClientManager;

//! Telegram module for handling Telegram API interactions

pub mod auth;
pub mod client_manager;
pub mod updates;

pub use client_manager::TelegramClientManager;

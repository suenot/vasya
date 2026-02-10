//! Tauri commands module
//!
//! This module contains all Tauri IPC commands that frontend can call

pub mod auth;
pub mod settings;
pub mod chats;
pub mod messages;
pub mod media;
pub mod peer_resolve;

pub use auth::*;
pub use settings::*;
pub use chats::*;
pub use messages::*;
pub use media::*;

//! Telegram authentication module

use anyhow::{Context, Result};
use grammers_client::{Client, SignInError};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};

/// User information after successful authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub phone: String,
}

/// Authentication token for multi-step auth process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub token_data: String,  // Serialized token
    pub phone: String,
}

/// Request login code from Telegram
pub async fn request_login_code(
    client: &Client,
    phone: &str,
    api_hash: &str,
) -> Result<AuthToken> {
    let token = client
        .request_login_code(phone, api_hash)
        .await
        .context("Failed to request login code")?;

    // For now, just store phone number
    // Token handling needs to be implemented differently
    Ok(AuthToken {
        token_data: "token_placeholder".to_string(),
        phone: phone.to_string(),
    })
}

/// Verify code entered by user
pub async fn verify_code(
    client: &Client,
    token: &str,
    code: &str,
) -> Result<Result<UserInfo, String>> {
    // For now, we'll need to handle this differently
    // This is a simplified version - we'll need to store the actual token
    unimplemented!("verify_code needs proper token handling")
}

/// Check 2FA password
pub async fn check_password(
    client: &Client,
    password_token: &str,
    password: &str,
) -> Result<UserInfo> {
    unimplemented!("check_password needs proper implementation")
}

/// Interactive authentication (for CLI/testing)
pub async fn authenticate_interactive(
    client: &Client,
    phone: &str,
    api_hash: &str,
) -> Result<UserInfo> {
    let token = client
        .request_login_code(phone, api_hash)
        .await
        .context("Failed to request login code")?;

    print!("Enter the code you received: ");
    std::io::stdout().flush()?;

    let code = std::io::stdin()
        .lock()
        .lines()
        .next()
        .context("Failed to read line")?
        .context("Failed to read code")?;

    match client.sign_in(&token, &code).await {
        Ok(_user) => {
            // grammers User API is different, need to get user info differently
            let user_info = UserInfo {
                id: 0, // Will be filled later
                first_name: "User".to_string(),
                last_name: None,
                username: None,
                phone: phone.to_string(),
            };
            Ok(user_info)
        }
        Err(SignInError::PasswordRequired(password_token)) => {
            print!("Enter 2FA password: ");
            std::io::stdout().flush()?;

            let password = std::io::stdin()
                .lock()
                .lines()
                .next()
                .context("Failed to read line")?
                .context("Failed to read password")?;

            let _user = client
                .check_password(password_token, password.as_bytes())
                .await
                .context("Failed to check password")?;

            let user_info = UserInfo {
                id: 0, // Will be filled later
                first_name: "User".to_string(),
                last_name: None,
                username: None,
                phone: phone.to_string(),
            };
            Ok(user_info)
        }
        Err(e) => Err(anyhow::anyhow!("Sign in failed: {}", e)),
    }
}

//! Authentication commands for Tauri frontend

use grammers_client::SignInError;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::telegram::auth::{AuthToken, UserInfo};
use crate::AppState;

/// Request login code from Telegram
#[tauri::command]
pub async fn request_login_code(
    phone: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<AuthToken, String> {
    tracing::info!(phone = %phone, "Requesting login code");

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let account_id = Uuid::new_v4().to_string();

    let wrapper = client_manager
        .create_client(account_id.clone(), phone.clone())
        .await
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let api_hash = &client_manager.api_hash;

    // Add timeout to prevent infinite hang
    let token = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        wrapper.client.request_login_code(&phone, api_hash),
    )
    .await
    .map_err(|_| "Request timed out. Check your internet connection.".to_string())?
    .map_err(|e| format!("Failed to request login code: {}", e))?;

    // Store token for later verification
    state_guard.pending_logins.lock().await.insert(account_id.clone(), token);

    tracing::info!(account_id = %account_id, "Login code requested");
    Ok(AuthToken {
        token_data: account_id,
        phone,
    })
}

/// Verify the code entered by user
#[tauri::command]
pub async fn verify_code(
    token: String,
    code: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<UserInfo, String> {
    let account_id = token;
    tracing::info!(account_id = %account_id, "Verifying code");

    let state_guard = state.read().await;

    // Get pending login token
    let login_token = state_guard
        .pending_logins
        .lock()
        .await
        .remove(&account_id)
        .ok_or("Login session expired or invalid")?;

    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found")?;

    match wrapper.client.sign_in(&login_token, &code).await {
        Ok(_user) => {
            client_manager
                .save_session(&account_id)
                .await
                .map_err(|e| format!("Failed to save session: {}", e))?;

            let me = wrapper
                .client
                .get_me()
                .await
                .map_err(|e| format!("Failed to get user info: {}", e))?;

            // Start real-time updates handler
            if let Err(e) = client_manager.start_updates(&account_id, app).await {
                tracing::error!(error = %e, "Failed to start updates handler");
            }

            tracing::info!(name = ?me.first_name(), "User signed in successfully");
            Ok(UserInfo {
                id: me.raw.id(),
                first_name: me.first_name().unwrap_or("").to_string(),
                last_name: me.last_name().map(|s| s.to_string()),
                username: me.username().map(|s| s.to_string()),
                phone: wrapper.phone.clone(),
            })
        }
        Err(SignInError::PasswordRequired(password_token)) => {
            state_guard
                .pending_passwords
                .lock()
                .await
                .insert(account_id.clone(), password_token);
            Err("2FA password required".to_string())
        }
        Err(e) => Err(format!("Sign in failed: {}", e)),
    }
}

/// Check 2FA password
#[tauri::command]
pub async fn check_password(
    account_id: String,
    password: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<UserInfo, String> {
    tracing::info!(account_id = %account_id, "Checking 2FA password");

    let state_guard = state.read().await;

    let password_token = state_guard
        .pending_passwords
        .lock()
        .await
        .remove(&account_id)
        .ok_or("2FA session expired or invalid")?;

    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found")?;

    wrapper
        .client
        .check_password(password_token, password.as_bytes())
        .await
        .map_err(|e| format!("Password check failed: {}", e))?;

    client_manager
        .save_session(&account_id)
        .await
        .map_err(|e| format!("Failed to save session: {}", e))?;

    let me = wrapper
        .client
        .get_me()
        .await
        .map_err(|e| format!("Failed to get user info: {}", e))?;

    // Start real-time updates handler
    if let Err(e) = client_manager.start_updates(&account_id, app).await {
        tracing::error!(error = %e, "Failed to start updates handler");
    }

    tracing::info!(name = ?me.first_name(), "User signed in with 2FA");
    Ok(UserInfo {
        id: me.raw.id(),
        first_name: me.first_name().unwrap_or("").to_string(),
        last_name: me.last_name().map(|s| s.to_string()),
        username: me.username().map(|s| s.to_string()),
        phone: wrapper.phone.clone(),
    })
}

/// Logout current user
#[tauri::command]
pub async fn logout(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    tracing::info!(account_id = %account_id, "Logging out");

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    client_manager
        .remove_client(&account_id)
        .await
        .map_err(|e| format!("Failed to logout: {}", e))?;

    Ok(())
}

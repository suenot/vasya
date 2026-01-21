//! Authentication commands for Tauri frontend

use grammers_client::SignInError;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::telegram::auth::{AuthToken, UserInfo};
use crate::AppState;

// Storage for pending login tokens and password tokens
lazy_static::lazy_static! {
    static ref PENDING_LOGINS: Arc<Mutex<HashMap<String, grammers_client::types::LoginToken>>> =
        Arc::new(Mutex::new(HashMap::new()));
    static ref PENDING_PASSWORDS: Arc<Mutex<HashMap<String, grammers_client::types::PasswordToken>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// Request login code from Telegram
#[tauri::command]
pub async fn request_login_code(
    phone: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<AuthToken, String> {
    eprintln!("===== REQUEST_LOGIN_CODE CALLED =====");
    eprintln!("Phone: {}", phone);
    tracing::info!("Requesting login code for phone: {}", phone);

    eprintln!("Step 1: Getting state...");
    let state_guard = state.read().await;
    eprintln!("Step 2: State acquired");

    eprintln!("Step 3: Getting client_manager...");
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;
    eprintln!("Step 4: Client manager found");

    // Generate account ID
    let account_id = Uuid::new_v4().to_string();
    eprintln!("Step 5: Generated account_id: {}", account_id);

    // Create client
    eprintln!("Step 6: Calling create_client...");
    let wrapper = client_manager
        .create_client(account_id.clone(), phone.clone())
        .await
        .map_err(|e| {
            eprintln!("ERROR in create_client: {}", e);
            format!("Failed to create client: {}", e)
        })?;
    eprintln!("Step 7: Client created successfully");

    // Request login code (phone, api_hash)
    let api_hash = &client_manager.api_hash;
    eprintln!("Step 8: Calling grammers request_login_code with api_hash: {}", api_hash);

    // Add timeout to prevent infinite hang
    let request_future = wrapper.client.request_login_code(&phone, api_hash);
    let token = match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        request_future
    ).await {
        Ok(result) => result.map_err(|e| {
            eprintln!("ERROR in request_login_code: {:?}", e);
            format!("Failed to request login code: {}", e)
        })?,
        Err(_) => {
            eprintln!("ERROR: request_login_code timed out after 30 seconds");
            return Err("Request timed out. Please check your internet connection.".to_string());
        }
    };
    eprintln!("Step 9: Login code token received");

    // Store token for later verification
    let mut pending = PENDING_LOGINS.lock().await;
    pending.insert(account_id.clone(), token);

    tracing::info!("Login code requested successfully for account: {}", account_id);

    Ok(AuthToken {
        token_data: account_id,
        phone: phone.clone(),
    })
}

/// Verify the code entered by user
#[tauri::command]
pub async fn verify_code(
    token: String,
    code: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<UserInfo, String> {
    tracing::info!("Verifying code for account: {}", token);

    let account_id = token;

    // Get pending login token
    let mut pending = PENDING_LOGINS.lock().await;
    let login_token = pending
        .remove(&account_id)
        .ok_or("Login session expired or invalid")?;

    // Get client
    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found")?;

    // Try to sign in
    match wrapper.client.sign_in(&login_token, &code).await {
        Ok(_user) => {
            // Save session
            client_manager
                .save_session(&account_id)
                .await
                .map_err(|e| format!("Failed to save session: {}", e))?;

            // Get user info
            let me = wrapper.client.get_me().await
                .map_err(|e| format!("Failed to get user info: {}", e))?;

            tracing::info!("User signed in successfully: {:?}", me.first_name());

            Ok(UserInfo {
                id: me.raw.id(),
                first_name: me.first_name().unwrap_or("").to_string(),
                last_name: me.last_name().map(|s| s.to_string()),
                username: me.username().map(|s| s.to_string()),
                phone: wrapper.phone.clone(),
            })
        }
        Err(SignInError::PasswordRequired(password_token)) => {
            // Store password token for 2FA in separate HashMap
            let mut pending_passwords = PENDING_PASSWORDS.lock().await;
            pending_passwords.insert(account_id.clone(), password_token);
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
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<UserInfo, String> {
    tracing::info!("Checking 2FA password for account: {}", account_id);

    // Get password token from separate HashMap
    let mut pending_passwords = PENDING_PASSWORDS.lock().await;
    let password_token = pending_passwords
        .remove(&account_id)
        .ok_or("2FA session expired or invalid")?;

    // Get client
    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    let wrapper = client_manager
        .get_client(&account_id)
        .await
        .ok_or("Client not found")?;

    // Check password
    let _user = wrapper
        .client
        .check_password(password_token, password.as_bytes())
        .await
        .map_err(|e| format!("Password check failed: {}", e))?;

    // Save session
    client_manager
        .save_session(&account_id)
        .await
        .map_err(|e| format!("Failed to save session: {}", e))?;

    // Get user info
    let me = wrapper.client.get_me().await
        .map_err(|e| format!("Failed to get user info: {}", e))?;

    tracing::info!("User signed in with 2FA successfully: {:?}", me.first_name());

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
    tracing::info!("Logging out account: {}", account_id);

    let state_guard = state.read().await;
    let client_manager = state_guard
        .client_manager
        .as_ref()
        .ok_or("Client manager not initialized")?;

    // Remove client and session
    client_manager
        .remove_client(&account_id)
        .await
        .map_err(|e| format!("Failed to logout: {}", e))?;

    Ok(())
}

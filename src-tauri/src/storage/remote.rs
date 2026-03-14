//! Remote backend API storage implementation
//!
//! Uses reqwest HTTP client to call the backend/ REST API.

use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use std::net::IpAddr;
use url::Url;

use super::{ChatRecord, DataStorage, FolderRecord, TabRecord};

/// Validate that a remote URL is safe (no SSRF to internal networks).
fn validate_remote_url(raw: &str) -> Result<String> {
    let parsed = Url::parse(raw).context("Invalid URL")?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => anyhow::bail!("Only http/https URLs are allowed"),
    }
    if let Some(host) = parsed.host_str() {
        // Check for localhost
        if host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "0.0.0.0" {
            anyhow::bail!("Cannot connect to localhost");
        }
        // Check for private IPs
        if let Ok(ip) = host.parse::<IpAddr>() {
            match ip {
                IpAddr::V4(v4) => {
                    if v4.is_private() || v4.is_loopback() || v4.is_link_local() {
                        anyhow::bail!("Cannot connect to private/local IP addresses");
                    }
                }
                IpAddr::V6(v6) => {
                    if v6.is_loopback() {
                        anyhow::bail!("Cannot connect to loopback addresses");
                    }
                }
            }
        }
    }
    Ok(parsed.to_string().trim_end_matches('/').to_string())
}

/// Remote storage — calls backend REST API over HTTP
pub struct RemoteStorage {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl RemoteStorage {
    pub fn new(base_url: String, api_key: Option<String>) -> Result<Self> {
        let base_url = validate_remote_url(&base_url)?;
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .context("Failed to build HTTP client")?;
        Ok(RemoteStorage {
            client,
            base_url,
            api_key,
        })
    }

    /// Build a request with optional Bearer auth header
    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.request(method, format!("{}{}", self.base_url, path));
        if let Some(ref key) = self.api_key {
            req = req.bearer_auth(key);
        }
        req
    }
}

#[async_trait]
impl DataStorage for RemoteStorage {
    async fn save_chat(&self, chat: &ChatRecord) -> Result<()> {
        self.request(reqwest::Method::POST, "/api/chats")
            .json(chat)
            .send()
            .await
            .context("Failed to save chat to remote")?
            .error_for_status()
            .context("Remote returned error for save_chat")?;
        Ok(())
    }

    async fn get_chats(&self, account_id: &str) -> Result<Vec<ChatRecord>> {
        let chats = self
            .request(reqwest::Method::GET, "/api/chats")
            .query(&[("account_id", account_id)])
            .send()
            .await
            .context("Failed to get chats from remote")?
            .error_for_status()
            .context("Remote returned error for get_chats")?
            .json::<Vec<ChatRecord>>()
            .await
            .context("Failed to parse chats response")?;
        Ok(chats)
    }

    async fn get_folders(&self, account_id: &str) -> Result<Vec<FolderRecord>> {
        let folders = self
            .request(reqwest::Method::GET, "/api/folders")
            .query(&[("account_id", account_id)])
            .send()
            .await
            .context("Failed to get folders from remote")?
            .error_for_status()
            .context("Remote returned error for get_folders")?
            .json::<Vec<FolderRecord>>()
            .await
            .context("Failed to parse folders response")?;
        Ok(folders)
    }

    async fn save_folder(&self, account_id: &str, folder: &FolderRecord) -> Result<()> {
        self.request(reqwest::Method::POST, "/api/folders")
            .query(&[("account_id", account_id)])
            .json(folder)
            .send()
            .await
            .context("Failed to save folder to remote")?
            .error_for_status()
            .context("Remote returned error for save_folder")?;
        Ok(())
    }

    async fn delete_folder(&self, account_id: &str, id: &str) -> Result<()> {
        self.request(reqwest::Method::DELETE, &format!("/api/folders/{}", id))
            .query(&[("account_id", account_id)])
            .send()
            .await
            .context("Failed to delete folder from remote")?
            .error_for_status()
            .context("Remote returned error for delete_folder")?;
        Ok(())
    }

    async fn get_tabs(&self, account_id: &str) -> Result<Vec<TabRecord>> {
        let tabs = self
            .request(reqwest::Method::GET, "/api/tabs")
            .query(&[("account_id", account_id)])
            .send()
            .await
            .context("Failed to get tabs from remote")?
            .error_for_status()
            .context("Remote returned error for get_tabs")?
            .json::<Vec<TabRecord>>()
            .await
            .context("Failed to parse tabs response")?;
        Ok(tabs)
    }

    async fn save_tabs(&self, account_id: &str, tabs: &[TabRecord]) -> Result<()> {
        self.request(reqwest::Method::POST, "/api/tabs")
            .query(&[("account_id", account_id)])
            .json(tabs)
            .send()
            .await
            .context("Failed to save tabs to remote")?
            .error_for_status()
            .context("Remote returned error for save_tabs")?;
        Ok(())
    }
}

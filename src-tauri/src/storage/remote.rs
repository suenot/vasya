//! Remote backend API storage implementation
//!
//! Uses reqwest HTTP client to call the backend/ REST API.

use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use url::Url;

use super::{ChatRecord, DataStorage, FolderRecord, TabRecord};

/// Validate that a remote URL has a valid http/https scheme and is well-formed.
fn validate_remote_url(raw: &str) -> Result<String> {
    let parsed = Url::parse(raw).context("Invalid URL")?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => anyhow::bail!("Only http/https URLs are allowed"),
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

    async fn save_folder(&self, _account_id: &str, folder: &FolderRecord) -> Result<()> {
        self.request(reqwest::Method::POST, "/api/folders")
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── Valid URLs ──

    #[test]
    fn accepts_https_url() {
        let result = validate_remote_url("https://example.com");
        assert!(result.is_ok());
    }

    #[test]
    fn accepts_http_url_with_port() {
        let result = validate_remote_url("http://api.example.com:8080");
        assert!(result.is_ok());
    }

    #[test]
    fn accepts_https_url_with_path() {
        let result = validate_remote_url("https://example.com/api/v1");
        assert!(result.is_ok());
    }

    // ── Accepted: localhost (desktop app, no SSRF risk) ──

    #[test]
    fn accepts_localhost() {
        let result = validate_remote_url("http://localhost");
        assert!(result.is_ok());
    }

    #[test]
    fn accepts_localhost_with_port() {
        let result = validate_remote_url("http://localhost:3000");
        assert!(result.is_ok());
    }

    #[test]
    fn accepts_127_0_0_1() {
        let result = validate_remote_url("http://127.0.0.1");
        assert!(result.is_ok());
    }

    // ── Rejected: non-http schemes ──

    #[test]
    fn rejects_ftp_scheme() {
        let result = validate_remote_url("ftp://example.com");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("http"));
    }

    #[test]
    fn rejects_file_scheme() {
        let result = validate_remote_url("file:///etc/passwd");
        assert!(result.is_err());
    }

    // ── URL normalization ──

    #[test]
    fn strips_trailing_slash() {
        let result = validate_remote_url("https://example.com/").unwrap();
        assert!(!result.ends_with('/'));
        assert_eq!(result, "https://example.com");
    }

    #[test]
    fn preserves_url_without_trailing_slash() {
        let result = validate_remote_url("https://example.com").unwrap();
        assert_eq!(result, "https://example.com");
    }

    // ── Invalid format ──

    #[test]
    fn rejects_invalid_url() {
        let result = validate_remote_url("not a url at all");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_empty_string() {
        let result = validate_remote_url("");
        assert!(result.is_err());
    }

    // ── RemoteStorage::new ──

    #[test]
    fn remote_storage_new_valid() {
        let storage = RemoteStorage::new(
            "https://example.com".to_string(),
            Some("key".to_string()),
        );
        assert!(storage.is_ok());
    }

    #[test]
    fn remote_storage_new_accepts_localhost() {
        let storage = RemoteStorage::new(
            "http://localhost:3000".to_string(),
            None,
        );
        assert!(storage.is_ok());
    }
}

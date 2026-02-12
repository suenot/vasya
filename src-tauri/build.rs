fn main() {
    // Embed TELEGRAM_API_ID and TELEGRAM_API_HASH from .env into the binary at compile time
    let env_path = std::path::Path::new("../.env");
    if env_path.exists() {
        println!("cargo:rerun-if-changed=../.env");
        if let Ok(contents) = std::fs::read_to_string(env_path) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();
                    if key == "TELEGRAM_API_ID" || key == "TELEGRAM_API_HASH" {
                        println!("cargo:rustc-env={}={}", key, value);
                    }
                }
            }
        }
    }

    tauri_build::build()
}

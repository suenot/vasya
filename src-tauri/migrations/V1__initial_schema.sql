-- Initial database schema for Telegram client

-- Аккаунты
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,              -- UUID
    phone TEXT NOT NULL UNIQUE,
    session_path TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    is_authorized BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Чаты/диалоги
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER NOT NULL,              -- Telegram chat_id
    account_id TEXT NOT NULL,
    type TEXT NOT NULL,               -- 'user', 'group', 'channel'
    title TEXT NOT NULL,
    username TEXT,
    photo_id TEXT,
    avatar_path TEXT,                 -- Локальный путь к аватарке
    last_message TEXT,                -- Текст последнего сообщения
    unread_count INTEGER DEFAULT 0,
    last_message_id INTEGER,
    last_message_date INTEGER,
    pinned BOOLEAN DEFAULT 0,
    is_focus BOOLEAN DEFAULT 0,       -- Для режима "фокус"
    packed_peer TEXT NOT NULL DEFAULT "", -- Packed peer representation for grammers
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, account_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chats_account ON chats(account_id);
CREATE INDEX IF NOT EXISTS idx_chats_focus ON chats(account_id, is_focus);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(account_id, updated_at DESC);

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id INTEGER,                       -- Telegram user_id
    account_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    phone TEXT,
    photo_id TEXT,
    is_bot BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, account_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);

-- Сообщения
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER NOT NULL,              -- Telegram message_id
    chat_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    from_user_id INTEGER,
    text TEXT,
    date INTEGER NOT NULL,            -- Unix timestamp
    edit_date INTEGER,
    is_outgoing BOOLEAN DEFAULT 0,
    reply_to_message_id INTEGER,
    forward_from_user_id INTEGER,
    forward_from_chat_id INTEGER,
    has_media BOOLEAN DEFAULT 0,
    media_type TEXT,                  -- 'photo', 'video', 'audio', 'document', 'voice'
    media_id TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (id, chat_id, account_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(account_id, date DESC);

-- Медиа (кеш)
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    type TEXT NOT NULL,               -- 'photo', 'video', 'audio', 'document'
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,                 -- Для видео/аудио
    downloaded_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_account ON media(account_id);

-- Настройки приложения
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Пользовательские папки чатов
CREATE TABLE IF NOT EXISTS chat_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    included_chat_types TEXT NOT NULL DEFAULT '[]',   -- JSON array of ChatTypeFilter
    excluded_chat_types TEXT NOT NULL DEFAULT '[]',
    included_chat_ids TEXT NOT NULL DEFAULT '[]',     -- JSON array of chat ids
    excluded_chat_ids TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Вкладки (порядок и видимость built-in и кастомных)
CREATE TABLE IF NOT EXISTS chat_tabs (
    id TEXT PRIMARY KEY,             -- 'all', 'contacts', 'chats', 'favorites', or folder id
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

// TypeScript типы для Telegram клиента

export interface UserInfo {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  phone: string;
}

export interface Chat {
  id: number;
  title: string;
  username?: string;
  unreadCount: number;
  chatType: 'user' | 'group' | 'channel';
  lastMessage?: string;
}

export interface MediaInfo {
  media_type: 'photo' | 'video' | 'audio' | 'voice' | 'document' | 'sticker' | 'videonote' | 'other';
  file_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  thumbnail_path?: string;
}

export interface Message {
  id: number;
  chat_id: number;
  account_id: string;
  from_user_id?: number;
  text?: string;
  date: number;
  edit_date?: number;
  is_outgoing: boolean;
  reply_to_message_id?: number;
  has_media: boolean;
  media_type?: string;
  media_id?: string;
  media?: MediaInfo[];
}

export interface AccountInfo {
  id: string;
  phone: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_authorized: boolean;
}

export type ChatFilter = 'all' | 'focus';

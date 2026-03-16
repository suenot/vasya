# Changelog

## [0.7.3] - 2026-03-16
### Bug Fixes
- Fix Android keyboard squishing entire app — switch from `resizes-content` to `overlays-content`
- Keyboard now overlays content instead of compressing it; input lifts above keyboard via `--keyboard-height` CSS var
- Auto-scroll messages to bottom when keyboard opens on mobile

## [0.7.2] - 2026-03-15
### Bug Fixes
- Fix Android keyboard pushing content up (visualViewport API + CSS var)
- Fix MessageInput safe-area-inset-bottom being overridden

## [0.7.1] - 2026-03-15
### Improvements
- Landing: replaced two-button language switcher with single toggle button

## [0.7.0] - 2026-03-15
### Features
- Create group chats, channels, and supergroups from sidebar
- New Chat button with dropdown menu (group, channel, secret chat)
- Interface scale slider (50%–200%) with live zoom
- Message text size selector (small / medium / large)
- Notification sound toggle (silent notifications)
- Message preview toggle (hide text in notifications)
- Markdown rendering in merged message groups

### Improvements
- Settings controls fully wired to persistent store
- i18n translations for all new features (en/ru)

## [0.6.0] - 2026-03-15
### Features
- Voice & video calls with E2E encryption (DH key exchange)
- Group calls (create, join, leave, mute)
- Message forwarding with chat picker dialog
- Avatar viewer with photo gallery and navigation
- Native OS notifications (macOS, Windows, Linux)
- Folder context menu (Read All, Mute All, Delete)
- Message context menu & multi-select mode
- Markdown rendering in messages
- Chat sorting: unread first in all folders except "All Chats"

### Improvements
- Fullscreen image viewer with zoom, pan, download
- Message grouping (consecutive messages from same sender)
- Theme-aware styling for all new components
- i18n support for all new features (en/ru)
- Sidebar scroll fix
- Call debug logging

## [0.5.0] - 2026-03-10
### Features
- Message bubbles with Telegram-style design
- Unread badges and folder counters
- Enhanced search with global results
- Media UI improvements

## [0.4.0] - 2026-03-05
### Features
- Telegram forum topics support
- Hotkeys and keyboard navigation
- Media attachments and voice recording
- Call placeholders

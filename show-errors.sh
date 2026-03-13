#!/bin/bash
# Быстрый просмотр ошибок из логов

LOG_FILE="src-tauri/logs/telegram-client.log.$(date +%Y-%m-%d)"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Лог-файл не найден: $LOG_FILE"
    exit 1
fi

echo "🔍 Последние ошибки загрузки медиа:"
echo "===================================="
grep "DOWNLOAD_MEDIA.*FAILED" "$LOG_FILE" | tail -10

echo ""
echo "📊 Успешные загрузки:"
echo "===================================="
grep "DOWNLOAD_MEDIA.*SUCCESS" "$LOG_FILE" | tail -10

echo ""
echo "⚠️  Типы ошибок:"
echo "===================================="
grep "✗ Failed to download media" "$LOG_FILE" | sed 's/.*✗ Failed to download media: //' | sort | uniq -c

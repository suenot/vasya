#!/bin/bash

# Скрипт для просмотра логов Telegram Client

LOG_DIR="src-tauri/logs"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/telegram-client.log.$TODAY"

echo "📋 Просмотр логов Telegram Client"
echo "=================================="
echo ""

# Проверяем существование директории
if [ ! -d "$LOG_DIR" ]; then
    echo "❌ Директория логов не найдена. Запустите приложение сначала."
    exit 1
fi

# Проверяем существование файла логов за сегодня
if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Лог-файл за сегодня не найден: $LOG_FILE"
    echo ""
    echo "Доступные лог-файлы:"
    ls -lh "$LOG_DIR"/*.log.* 2>/dev/null || echo "Нет файлов логов"
    exit 1
fi

# Меню выбора
echo "Выберите режим просмотра:"
echo "1) Показать весь лог"
echo "2) Показать только ошибки (ERROR)"
echo "3) Показать только медиа-загрузки"
echo "4) Следить за логом в реальном времени (tail -f)"
echo "5) Показать последние 50 строк"
echo ""
read -p "Ваш выбор (1-5): " choice

case $choice in
    1)
        echo ""
        echo "=== Весь лог ==="
        cat "$LOG_FILE"
        ;;
    2)
        echo ""
        echo "=== Только ошибки ==="
        grep -i "ERROR\|✗" "$LOG_FILE" || echo "Ошибок не найдено"
        ;;
    3)
        echo ""
        echo "=== Загрузки медиа ==="
        grep "DOWNLOAD_MEDIA\|download_media" "$LOG_FILE" || echo "Загрузок не найдено"
        ;;
    4)
        echo ""
        echo "=== Следим за логом (Ctrl+C для выхода) ==="
        tail -f "$LOG_FILE"
        ;;
    5)
        echo ""
        echo "=== Последние 50 строк ==="
        tail -n 50 "$LOG_FILE"
        ;;
    *)
        echo "Неверный выбор"
        exit 1
        ;;
esac

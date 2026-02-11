import { useEffect, useCallback } from 'react';
import { LoginForm } from './components/Auth/LoginForm';
import { MainLayout } from './components/Layout/MainLayout';
import { ApiSettings } from './components/Settings/ApiSettings';
import { useSettingsStore } from './store/settingsStore';
import { useAccountsStore } from './store/accountsStore';
import { useThemeStore } from './store/themeStore';
import { useConnectionStore } from './store/connectionStore';
import { useSystemTheme } from './hooks/useSystemTheme';
import { useTauriEvent } from './hooks/useTauriEvent';
import { useTauriCommand } from './hooks/useTauriCommand';
import { ErrorBoundary } from './components/ErrorBoundary';
import "./App.css";

interface ConnectionStatusEvent {
  account_id: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
}

function App() {
  const { isConfigured, setApiCredentials } = useSettingsStore();
  const { getActiveAccount } = useAccountsStore();
  const { themeSetting, setEffectiveTheme } = useThemeStore();
  const { setConnected, setDisconnected, setReconnecting } = useConnectionStore();
  const systemTheme = useSystemTheme();
  const updateApiCredentials = useTauriCommand<void, { apiId: number; apiHash: string }>('update_api_credentials');

  // Track connection status from Rust backend
  useTauriEvent<ConnectionStatusEvent>('connection-status', useCallback((evt) => {
    switch (evt.status) {
      case 'connected': setConnected(); break;
      case 'disconnected': setDisconnected(); break;
      case 'reconnecting': setReconnecting(); break;
    }
  }, [setConnected, setDisconnected, setReconnecting]));

  // Применяем тему при монтировании и изменении настроек
  useEffect(() => {
    const effectiveTheme = themeSetting === 'system' ? systemTheme : themeSetting;
    setEffectiveTheme(effectiveTheme);

    // Устанавливаем data-theme атрибут на :root
    if (effectiveTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [themeSetting, systemTheme, setEffectiveTheme]);

  const handleApiSave = async (apiId: string, apiHash: string) => {
    try {
      // Отправить в backend
      await updateApiCredentials({
        apiId: parseInt(apiId),
        apiHash: apiHash,
      });

      // Сохранить в localStorage
      setApiCredentials(apiId, apiHash);
    } catch (err) {
      console.error('Failed to update API credentials:', err);
      alert('Ошибка при сохранении API credentials');
    }
  };

  // Если API не настроен - показываем экран настройки
  if (!isConfigured) {
    return (
      <div className="app">
        <ApiSettings onSave={handleApiSave} />
      </div>
    );
  }

  // Если есть активный аккаунт - показываем главный интерфейс
  const activeAccount = getActiveAccount();
  if (activeAccount) {
    return (
      <div className="app">
        <ErrorBoundary><MainLayout /></ErrorBoundary>
      </div>
    );
  }

  // Иначе - показываем форму входа
  return (
    <div className="app">
      <ErrorBoundary><LoginForm /></ErrorBoundary>
    </div>
  );
}

export default App;

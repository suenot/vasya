import { useEffect, useCallback, useMemo, useRef } from 'react';
import { LoginForm } from './components/Auth/LoginForm';
import { MainLayout } from './components/Layout/MainLayout';
import { ApiSettings } from './components/Settings/ApiSettings';
import { useSettingsStore } from './store/settingsStore';
import { useAccountsStore } from './store/accountsStore';
import { useThemeStore } from './store/themeStore';
import { useConnectionStore } from './store/connectionStore';
import { useSttStore } from './store/sttStore';
import { useSystemTheme } from './hooks/useSystemTheme';
import { useTauriEvent } from './hooks/useTauriEvent';
import { useTauriCommand } from './hooks/useTauriCommand';
import { ErrorBoundary } from './components/ErrorBoundary';
import "./App.css";

interface ConnectionStatusEvent {
  accountId: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
}

function App() {
  // Individual selectors — only re-render when the selected value changes
  const isConfigured = useSettingsStore((s) => s.isConfigured);
  const setApiCredentials = useSettingsStore((s) => s.setApiCredentials);
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const themeSetting = useThemeStore((s) => s.themeSetting);
  const setEffectiveTheme = useThemeStore((s) => s.setEffectiveTheme);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setDisconnected = useConnectionStore((s) => s.setDisconnected);
  const setReconnecting = useConnectionStore((s) => s.setReconnecting);
  const loadSttSettings = useSttStore((s) => s.loadSettings);
  const systemTheme = useSystemTheme();
  const updateApiCredentials = useTauriCommand<void, { apiId: number; apiHash: string }>('update_api_credentials');
  const getApiCredentials = useTauriCommand<[number, string]>('get_api_credentials');

  // On mount: check if backend already has credentials (from bundled .env)
  useEffect(() => {
    if (!isConfigured) {
      getApiCredentials().then((result) => {
        const [apiId, apiHash] = result;
        if (apiId && apiId !== 0 && apiHash && apiHash.length > 0) {
          setApiCredentials(String(apiId), apiHash);
        }
      }).catch(() => {
        // Backend not ready yet, user will see setup screen
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load STT settings on mount
  useEffect(() => {
    loadSttSettings();
  }, [loadSttSettings]);

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

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );

  // Remember previous active account ID so we can restore it on cancel
  const prevAccountIdRef = useRef<string | null>(activeAccountId);
  useEffect(() => {
    if (activeAccountId) {
      prevAccountIdRef.current = activeAccountId;
    }
  }, [activeAccountId]);

  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);

  const handleLoginCancel = useCallback(() => {
    const fallbackId = prevAccountIdRef.current || accounts[0]?.id;
    if (fallbackId) {
      setActiveAccount(fallbackId);
    }
  }, [accounts, setActiveAccount]);

  // Если API не настроен - показываем экран настройки
  if (!isConfigured) {
    return (
      <div className="app">
        <ApiSettings onSave={handleApiSave} />
      </div>
    );
  }

  // Если есть активный аккаунт - показываем главный интерфейс
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
      <ErrorBoundary><LoginForm onCancel={accounts.length > 0 ? handleLoginCancel : undefined} /></ErrorBoundary>
    </div>
  );
}

export default App;

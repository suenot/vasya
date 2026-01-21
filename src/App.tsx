import { LoginForm } from './components/Auth/LoginForm';
import { MainLayout } from './components/Layout/MainLayout';
import { ApiSettings } from './components/Settings/ApiSettings';
import { useSettingsStore } from './store/settingsStore';
import { useAccountsStore } from './store/accountsStore';
import { useTauriCommand } from './hooks/useTauriCommand';
import "./App.css";

function App() {
  const { isConfigured, setApiCredentials } = useSettingsStore();
  const { getActiveAccount } = useAccountsStore();
  const updateApiCredentials = useTauriCommand<void, { api_id: number; api_hash: string }>('update_api_credentials');

  const handleApiSave = async (apiId: string, apiHash: string) => {
    try {
      // Отправить в backend
      await updateApiCredentials({
        api_id: parseInt(apiId),
        api_hash: apiHash,
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
        <MainLayout />
      </div>
    );
  }

  // Иначе - показываем форму входа
  return (
    <div className="app">
      <LoginForm />
    </div>
  );
}

export default App;

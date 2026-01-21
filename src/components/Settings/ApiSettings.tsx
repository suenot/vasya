import { useState } from 'react';
import './ApiSettings.css';

interface ApiSettingsProps {
  onSave: (apiId: string, apiHash: string) => void;
}

export const ApiSettings = ({ onSave }: ApiSettingsProps) => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiId.trim() || !apiHash.trim()) {
      setError('Заполните все поля');
      return;
    }

    const parsedApiId = parseInt(apiId);
    if (isNaN(parsedApiId)) {
      setError('API ID должен быть числом');
      return;
    }

    onSave(apiId, apiHash);
  };

  return (
    <div className="api-settings-container">
      <div className="api-settings-card">
        <h1 className="api-settings-title">Настройка Telegram API</h1>

        <p className="api-settings-description">
          Для работы приложения нужны API credentials от Telegram.
          <br />
          Получите их на{' '}
          <a
            href="https://my.telegram.org"
            target="_blank"
            rel="noopener noreferrer"
            className="api-settings-link"
          >
            my.telegram.org
          </a>
        </p>

        <form onSubmit={handleSubmit} className="api-settings-form">
          <div className="form-group">
            <label htmlFor="api-id" className="form-label">
              API ID
            </label>
            <input
              id="api-id"
              type="text"
              className="form-input"
              placeholder="12345678"
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="api-hash" className="form-label">
              API Hash
            </label>
            <input
              id="api-hash"
              type="text"
              className="form-input"
              placeholder="abcdef1234567890abcdef1234567890"
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="form-button">
            Сохранить
          </button>
        </form>

        <div className="api-settings-help">
          <p className="help-title">Как получить API credentials:</p>
          <ol className="help-steps">
            <li>Откройте <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer">my.telegram.org</a></li>
            <li>Войдите используя свой номер телефона</li>
            <li>Перейдите в раздел "API development tools"</li>
            <li>Создайте новое приложение</li>
            <li>Скопируйте API ID и API Hash</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

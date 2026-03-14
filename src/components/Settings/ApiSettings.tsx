import { useState } from 'react';
import { useTranslation } from '../../i18n';
import './ApiSettings.css';

interface ApiSettingsProps {
  onSave: (apiId: string, apiHash: string) => void;
}

export const ApiSettings = ({ onSave }: ApiSettingsProps) => {
  const { t } = useTranslation();
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiId.trim() || !apiHash.trim()) {
      setError(t('api_fill_fields'));
      return;
    }

    const parsedApiId = parseInt(apiId);
    if (isNaN(parsedApiId)) {
      setError(t('api_id_number'));
      return;
    }

    onSave(apiId, apiHash);
  };

  return (
    <div className="api-settings-container">
      <div className="api-settings-card">
        <h1 className="api-settings-title">{t('api_setup_title')}</h1>

        <p className="api-settings-description">
          {t('api_setup_desc')}
          <br />
          {t('api_step_open')}{' '}
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="form-button">
            {t('api_save')}
          </button>
        </form>

        <div className="api-settings-help">
          <p className="help-title">{t('api_how_to')}:</p>
          <ol className="help-steps">
            <li>{t('api_step_open')} <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer">my.telegram.org</a></li>
            <li>{t('api_step_login')}</li>
            <li>{t('api_step_navigate')}</li>
            <li>{t('api_step_create')}</li>
            <li>{t('api_step_copy')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

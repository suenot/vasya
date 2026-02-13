import { useState, useEffect } from 'react';
import { ProfileSettings } from './ProfileSettings';
import { useAccountsStore } from '../../store/accountsStore';
import { useThemeStore, ThemeSetting } from '../../store/themeStore';
import { useDownloadStore } from '../../store/downloadStore';
import { useSttStore, SttProvider } from '../../store/sttStore';
import './AccountSettings.css';

interface AccountSettingsProps {
  onClose: () => void;
}

type SettingsSection = 'general' | 'privacy' | 'data' | 'downloads' | 'stt' | 'folders' | 'devices' | 'language';

export const AccountSettings = ({ onClose }: AccountSettingsProps) => {
  const { getActiveAccount } = useAccountsStore();
  const { themeSetting, setThemeSetting } = useThemeStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  const { queued, active, completed, failed, activeItems, queuedItems } = useDownloadStore();
  const sttSettings = useSttStore((s) => s.settings);
  const sttLoading = useSttStore((s) => s.loading);
  const whisperModels = useSttStore((s) => s.whisperModels);
  const loadSttSettings = useSttStore((s) => s.loadSettings);
  const saveSttSettings = useSttStore((s) => s.saveSettings);
  const loadWhisperModels = useSttStore((s) => s.loadWhisperModels);
  const downloadModel = useSttStore((s) => s.downloadModel);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);

  useEffect(() => {
    if (activeSection === 'stt') {
      loadSttSettings();
      loadWhisperModels();
    }
  }, [activeSection, loadSttSettings, loadWhisperModels]);
  const activeAccount = getActiveAccount();

  const handleThemeChange = (newTheme: ThemeSetting) => {
    setThemeSetting(newTheme);
  };

  const renderGeneralSettings = () => (
    <div className="settings-content">
      <h2>Основные настройки</h2>

      {/* Тема */}
      <div className="settings-group">
        <h3>Оформление</h3>

        <div className="settings-item">
          <div className="settings-item-label">
            <div className="settings-item-title">Тема</div>
            <div className="settings-item-description">
              {themeSetting === 'system' ? 'Как в системе' : themeSetting === 'light' ? 'Светлая' : 'Тёмная'}
            </div>
          </div>
        </div>

        <div className="theme-options">
          <label className={`theme-option ${themeSetting === 'system' ? 'active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="system"
              checked={themeSetting === 'system'}
              onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)}
            />
            <div className="theme-preview system">
              <div className="theme-preview-half light"></div>
              <div className="theme-preview-half dark"></div>
            </div>
            <span>Как в системе</span>
          </label>

          <label className={`theme-option ${themeSetting === 'light' ? 'active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="light"
              checked={themeSetting === 'light'}
              onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)}
            />
            <div className="theme-preview light"></div>
            <span>Светлая</span>
          </label>

          <label className={`theme-option ${themeSetting === 'dark' ? 'active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={themeSetting === 'dark'}
              onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)}
            />
            <div className="theme-preview dark"></div>
            <span>Тёмная</span>
          </label>
        </div>
      </div>

      {/* Другие настройки */}
      <div className="settings-group">
        <h3>Интерфейс</h3>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Масштаб интерфейса</div>
            <div className="settings-item-description">100%</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Размер текста в сообщениях</div>
            <div className="settings-item-description">Средний</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>

      <div className="settings-group">
        <h3>Уведомления</h3>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Звук уведомлений</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Предпросмотр в уведомлениях</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderPrivacySettings = () => (
    <div className="settings-content">
      <h2>Конфиденциальность</h2>

      <div className="settings-group">
        <h3>Приватность</h3>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Номер телефона</div>
            <div className="settings-item-description">Мои контакты</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Последний раз в сети</div>
            <div className="settings-item-description">Все</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Фото профиля</div>
            <div className="settings-item-description">Все</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>

      <div className="settings-group">
        <h3>Безопасность</h3>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Активные сеансы</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Двухэтапная аутентификация</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderDataSettings = () => (
    <div className="settings-content">
      <h2>Данные и память</h2>

      <div className="settings-group">
        <h3>Использование памяти</h3>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Управление памятью</div>
            <div className="settings-item-description">Очистить кэш</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>

        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">Использование сети</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>

      <div className="settings-group">
        <h3>Автоматическая загрузка медиа</h3>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Фото</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Видео</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">Файлы</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderDownloadsSettings = () => {
    const total = active + queued;
    return (
      <div className="settings-content">
        <h2>Downloads</h2>

        <div className="settings-group">
          <h3>Status</h3>
          <div className="downloads-stats-grid">
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-active">{active}</span>
              <span className="downloads-stat-label">Active</span>
            </div>
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-queued">{queued}</span>
              <span className="downloads-stat-label">Queued</span>
            </div>
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-done">{completed}</span>
              <span className="downloads-stat-label">Completed</span>
            </div>
            {failed > 0 && (
              <div className="downloads-stat-card">
                <span className="downloads-stat-value stat-failed">{failed}</span>
                <span className="downloads-stat-label">Failed</span>
              </div>
            )}
          </div>
        </div>

        {activeItems.length > 0 && (
          <div className="settings-group">
            <h3>Downloading</h3>
            {activeItems.map((item) => (
              <div key={`${item.chatId}_${item.messageId}`} className="settings-item">
                <div className="settings-item-label">
                  <div className="settings-item-title downloads-item-active">
                    <div className="download-item-spinner" />
                    Chat {item.chatId} / msg {item.messageId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {queuedItems.length > 0 && (
          <div className="settings-group">
            <h3>Queue ({queued})</h3>
            {queuedItems.map((item) => (
              <div key={`${item.chatId}_${item.messageId}`} className="settings-item">
                <div className="settings-item-label">
                  <div className="settings-item-title downloads-item-queued">
                    <div className="download-item-dot" />
                    Chat {item.chatId} / msg {item.messageId}
                  </div>
                </div>
              </div>
            ))}
            {queued > 20 && (
              <div className="settings-item">
                <div className="settings-item-label">
                  <div className="settings-item-description">+{queued - 20} more in queue</div>
                </div>
              </div>
            )}
          </div>
        )}

        {total === 0 && completed === 0 && (
          <p className="settings-placeholder">No downloads yet</p>
        )}
        {total === 0 && completed > 0 && (
          <p className="settings-placeholder">All downloads completed</p>
        )}
      </div>
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const handleDownloadModel = async (name: string) => {
    setDownloadingModel(name);
    try {
      await downloadModel(name);
    } catch {
      // error logged in store
    } finally {
      setDownloadingModel(null);
    }
  };

  const renderSttSettings = () => (
    <div className="settings-content">
      <h2>Распознавание голоса (STT)</h2>

      <div className="settings-group">
        <h3>Провайдер</h3>

        <div className="stt-provider-options">
          <label className={`stt-provider-option ${sttSettings.provider === 'deepgram' ? 'active' : ''}`}>
            <input
              type="radio"
              name="stt-provider"
              value="deepgram"
              checked={sttSettings.provider === 'deepgram'}
              onChange={() => saveSttSettings({ provider: 'deepgram' as SttProvider })}
            />
            <div className="stt-provider-info">
              <div className="stt-provider-name">Deepgram (облако)</div>
              <div className="stt-provider-desc">
                Быстро и качественно. Требуется интернет. API-ключ зашит в приложение.
              </div>
            </div>
          </label>

          <label className={`stt-provider-option ${sttSettings.provider === 'local_whisper' ? 'active' : ''}`}>
            <input
              type="radio"
              name="stt-provider"
              value="local_whisper"
              checked={sttSettings.provider === 'local_whisper'}
              onChange={() => saveSttSettings({ provider: 'local_whisper' as SttProvider })}
            />
            <div className="stt-provider-info">
              <div className="stt-provider-name">Whisper (локально)</div>
              <div className="stt-provider-desc">
                Полностью офлайн. Приватно. Требуется скачать модель.
              </div>
              <div className="stt-provider-warning">
                ~1 ГБ ОЗУ при использовании (для телефонов может быть критично)
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="settings-group">
        <h3>Язык распознавания</h3>
        <select
          className="stt-language-select"
          value={sttSettings.language}
          onChange={(e) => saveSttSettings({ language: e.target.value })}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="uk">Українська</option>
          <option value="de">Deutsch</option>
          <option value="fr">Fran&ccedil;ais</option>
          <option value="es">Espa&ntilde;ol</option>
          <option value="multi">Авто (мультиязык)</option>
        </select>
      </div>

      {sttSettings.provider === 'local_whisper' && (
        <div className="settings-group">
          <h3>Модели Whisper</h3>
          <div className="stt-models-list">
            {whisperModels.map((model) => (
              <div key={model.name} className="stt-model-item">
                <div className="stt-model-info">
                  <div className="stt-model-name">
                    {model.name}
                    {sttSettings.whisper_model === model.name && (
                      <span className="stt-model-active"> (активна)</span>
                    )}
                  </div>
                  <div className="stt-model-size">
                    {model.downloaded && model.size ? formatSize(model.size) : (
                      model.name === 'tiny' ? '~75 MB' :
                      model.name === 'base' ? '~142 MB' :
                      '~466 MB'
                    )}
                  </div>
                </div>
                <div className="stt-model-actions">
                  {model.downloaded ? (
                    <>
                      <span className="stt-model-downloaded">Скачана</span>
                      {sttSettings.whisper_model !== model.name && (
                        <button
                          className="stt-model-select-btn"
                          onClick={() => saveSttSettings({ whisper_model: model.name })}
                        >
                          Выбрать
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className="stt-model-download-btn"
                      disabled={sttLoading || downloadingModel !== null}
                      onClick={() => handleDownloadModel(model.name)}
                    >
                      {downloadingModel === model.name ? 'Загрузка...' : 'Скачать'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'privacy':
        return renderPrivacySettings();
      case 'data':
        return renderDataSettings();
      case 'downloads':
        return renderDownloadsSettings();
      case 'stt':
        return renderSttSettings();
      case 'folders':
        return (
          <div className="settings-content">
            <h2>Папки</h2>
            <p className="settings-placeholder">Функция в разработке</p>
          </div>
        );
      case 'devices':
        return (
          <div className="settings-content">
            <h2>Устройства</h2>
            <p className="settings-placeholder">Функция в разработке</p>
          </div>
        );
      case 'language':
        return (
          <div className="settings-content">
            <h2>Язык</h2>
            <p className="settings-placeholder">Функция в разработке</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="account-settings-overlay" onClick={onClose}>
        <div className="account-settings" onClick={(e) => e.stopPropagation()}>
          {/* Боковая панель с разделами */}
          <aside className="settings-sidebar">
            <div className="settings-sidebar-header">
              <button className="icon-button" onClick={onClose} title="Закрыть">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h2>Настройки</h2>
            </div>

            <div
              className="settings-profile"
              onClick={() => setShowProfileEdit(true)}
              style={{ cursor: 'pointer' }}
            >
              <div className="settings-profile-avatar">
                {activeAccount?.userInfo?.first_name?.substring(0, 1)?.toUpperCase() || 'ME'}
              </div>
              <div className="settings-profile-info">
                <div className="settings-profile-name">
                  {activeAccount?.userInfo?.first_name || 'Пользователь'}
                </div>
                <div className="settings-profile-phone">{activeAccount?.userInfo?.phone || ''}</div>
              </div>
            </div>

            <nav className="settings-nav">
              <button
                className={`settings-nav-item ${activeSection === 'general' ? 'active' : ''}`}
                onClick={() => setActiveSection('general')}
              >
                <span className="settings-nav-icon">⚙️</span>
                Основные
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'privacy' ? 'active' : ''}`}
                onClick={() => setActiveSection('privacy')}
              >
                <span className="settings-nav-icon">🔒</span>
                Конфиденциальность
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'data' ? 'active' : ''}`}
                onClick={() => setActiveSection('data')}
              >
                <span className="settings-nav-icon">💾</span>
                Данные и память
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'downloads' ? 'active' : ''}`}
                onClick={() => setActiveSection('downloads')}
              >
                <span className="settings-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                Downloads
                {(active + queued > 0) && <span className="settings-nav-badge">{active + queued}</span>}
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'stt' ? 'active' : ''}`}
                onClick={() => setActiveSection('stt')}
              >
                <span className="settings-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </span>
                Голос (STT)
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'folders' ? 'active' : ''}`}
                onClick={() => setActiveSection('folders')}
              >
                <span className="settings-nav-icon">📁</span>
                Папки
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'devices' ? 'active' : ''}`}
                onClick={() => setActiveSection('devices')}
              >
                <span className="settings-nav-icon">📱</span>
                Устройства
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'language' ? 'active' : ''}`}
                onClick={() => setActiveSection('language')}
              >
                <span className="settings-nav-icon">🌐</span>
                Язык
              </button>
            </nav>
          </aside>

          {/* Основной контент */}
          <main className="settings-main">
            <button className="settings-close" onClick={onClose}>
              ✕
            </button>
            {renderContent()}
          </main>
        </div>
      </div>

      {/* Модальное окно редактирования профиля */}
      {showProfileEdit && <ProfileSettings onClose={() => setShowProfileEdit(false)} />}
    </>
  );
};

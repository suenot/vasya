import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ProfileSettings } from './ProfileSettings';
import { useAccountsStore } from '../../store/accountsStore';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore, ThemeSetting } from '../../store/themeStore';
import { useDownloadStore } from '../../store/downloadStore';
import { useSttStore, SttProvider } from '../../store/sttStore';
import { useHotkeysStore } from '../../store/hotkeysStore';
import { useTranslation, useLanguageStore, LANGUAGE_LABELS, Language } from '../../i18n';
import './AccountSettings.css';

interface AccountSettingsProps {
  onClose: () => void;
}

type SettingsSection = 'general' | 'privacy' | 'data' | 'downloads' | 'stt' | 'hotkeys' | 'folders' | 'devices' | 'language';

export const AccountSettings = ({ onClose }: AccountSettingsProps) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();
  const { getActiveAccount, accounts, removeAccount, setActiveAccount, clearActiveAccount } = useAccountsStore();
  const [loggingOut, setLoggingOut] = useState(false);
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

  const { hotkeys, updateHotkey, resetDefaults } = useHotkeysStore();
  const [listeningForKey, setListeningForKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeSection === 'stt') {
      loadSttSettings();
      loadWhisperModels();
    }
  }, [activeSection, loadSttSettings, loadWhisperModels]);
  const activeAccount = getActiveAccount();

  useEffect(() => {
    if (!listeningForKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys: string[] = [];
      if (e.metaKey) keys.push('Meta');
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');

      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      keys.push(e.key);
      updateHotkey(listeningForKey, keys);
      setListeningForKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningForKey, updateHotkey]);

  const handleThemeChange = (newTheme: ThemeSetting) => {
    setThemeSetting(newTheme);
  };

  const handleLogout = async () => {
    const account = getActiveAccount();
    if (!account || loggingOut) return;

    setLoggingOut(true);
    try {
      await invoke('logout', { accountId: account.id });
      removeAccount(account.id);
      const remaining = accounts.filter(a => a.id !== account.id);
      if (remaining.length > 0) {
        setActiveAccount(remaining[0].id);
      } else {
        useAuthStore.getState().logout();
        clearActiveAccount();
      }
      onClose();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const renderGeneralSettings = () => (
    <div className="settings-content">
      <h2>{t('general_settings')}</h2>

      <div className="settings-group">
        <h3>{t('appearance')}</h3>

        <div className="settings-item">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('theme')}</div>
            <div className="settings-item-description">
              {themeSetting === 'system' ? t('system_default') : themeSetting === 'light' ? t('light') : t('dark')}
            </div>
          </div>
        </div>

        <div className="theme-options">
          <label className={`theme-option ${themeSetting === 'system' ? 'active' : ''}`}>
            <input type="radio" name="theme" value="system" checked={themeSetting === 'system'} onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)} />
            <div className="theme-preview system">
              <div className="theme-preview-half light"></div>
              <div className="theme-preview-half dark"></div>
            </div>
            <span>{t('system_default')}</span>
          </label>

          <label className={`theme-option ${themeSetting === 'light' ? 'active' : ''}`}>
            <input type="radio" name="theme" value="light" checked={themeSetting === 'light'} onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)} />
            <div className="theme-preview light"></div>
            <span>{t('light')}</span>
          </label>

          <label className={`theme-option ${themeSetting === 'dark' ? 'active' : ''}`}>
            <input type="radio" name="theme" value="dark" checked={themeSetting === 'dark'} onChange={(e) => handleThemeChange(e.target.value as ThemeSetting)} />
            <div className="theme-preview dark"></div>
            <span>{t('dark')}</span>
          </label>
        </div>
      </div>

      <div className="settings-group">
        <h3>{t('interface')}</h3>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('interface_scale')}</div>
            <div className="settings-item-description">100%</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('message_text_size')}</div>
            <div className="settings-item-description">{t('medium')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>

      <div className="settings-group">
        <h3>{t('notifications')}</h3>
        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('notification_sound')}</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('message_preview')}</div>
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
      <h2>{t('privacy_security')}</h2>
      <div className="settings-group">
        <h3>{t('privacy')}</h3>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('phone_number')}</div>
            <div className="settings-item-description">{t('my_contacts')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('last_seen')}</div>
            <div className="settings-item-description">{t('everybody')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('profile_photo')}</div>
            <div className="settings-item-description">{t('everybody')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>
      <div className="settings-group">
        <h3>{t('security')}</h3>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('active_sessions')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
        <div className="settings-item toggle">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('two_step_verification')}</div>
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
      <h2>{t('data_storage')}</h2>
      <div className="settings-group">
        <h3>{t('storage_usage')}</h3>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('manage_storage')}</div>
            <div className="settings-item-description">{t('clear_cache')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
        <div className="settings-item clickable">
          <div className="settings-item-label">
            <div className="settings-item-title">{t('network_usage')}</div>
          </div>
          <div className="settings-item-arrow">›</div>
        </div>
      </div>
      <div className="settings-group">
        <h3>{t('auto_media_download')}</h3>
        <div className="settings-item toggle">
          <div className="settings-item-label"><div className="settings-item-title">{t('photos')}</div></div>
          <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
        </div>
        <div className="settings-item toggle">
          <div className="settings-item-label"><div className="settings-item-title">{t('videos')}</div></div>
          <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
        </div>
        <div className="settings-item toggle">
          <div className="settings-item-label"><div className="settings-item-title">{t('files')}</div></div>
          <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
        </div>
      </div>
    </div>
  );

  const renderDownloadsSettings = () => {
    const total = active + queued;
    return (
      <div className="settings-content">
        <h2>{t('downloads')}</h2>
        <div className="settings-group">
          <h3>{t('status')}</h3>
          <div className="downloads-stats-grid">
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-active">{active}</span>
              <span className="downloads-stat-label">{t('active')}</span>
            </div>
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-queued">{queued}</span>
              <span className="downloads-stat-label">{t('queued')}</span>
            </div>
            <div className="downloads-stat-card">
              <span className="downloads-stat-value stat-done">{completed}</span>
              <span className="downloads-stat-label">{t('completed')}</span>
            </div>
            {failed > 0 && (
              <div className="downloads-stat-card">
                <span className="downloads-stat-value stat-failed">{failed}</span>
                <span className="downloads-stat-label">{t('failed')}</span>
              </div>
            )}
          </div>
        </div>

        {activeItems.length > 0 && (
          <div className="settings-group">
            <h3>{t('downloading')}</h3>
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
            <h3>{t('queue')} ({queued})</h3>
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
          <p className="settings-placeholder">{t('no_downloads')}</p>
        )}
        {total === 0 && completed > 0 && (
          <p className="settings-placeholder">{t('all_downloads_completed')}</p>
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
      <h2>{t('voice_stt')}</h2>
      <div className="settings-group">
        <h3>{t('provider')}</h3>
        <div className="stt-provider-options">
          <label className={`stt-provider-option ${sttSettings.provider === 'deepgram' ? 'active' : ''}`}>
            <input type="radio" name="stt-provider" value="deepgram" checked={sttSettings.provider === 'deepgram'} onChange={() => saveSttSettings({ provider: 'deepgram' as SttProvider })} />
            <div className="stt-provider-info">
              <div className="stt-provider-name">{t('deepgram_cloud')}</div>
              <div className="stt-provider-desc">{t('deepgram_desc')}</div>
            </div>
          </label>
          <label className={`stt-provider-option ${sttSettings.provider === 'local_whisper' ? 'active' : ''}`}>
            <input type="radio" name="stt-provider" value="local_whisper" checked={sttSettings.provider === 'local_whisper'} onChange={() => saveSttSettings({ provider: 'local_whisper' as SttProvider })} />
            <div className="stt-provider-info">
              <div className="stt-provider-name">{t('whisper_local')}</div>
              <div className="stt-provider-desc">{t('whisper_desc')}</div>
              <div className="stt-provider-warning">{t('whisper_warning')}</div>
            </div>
          </label>
        </div>
      </div>

      <div className="settings-group">
        <h3>{t('recognition_language')}</h3>
        <select className="stt-language-select" value={sttSettings.language} onChange={(e) => saveSttSettings({ language: e.target.value })}>
          <option value="ru">{t('lang_russian')}</option>
          <option value="en">{t('lang_english')}</option>
          <option value="uk">{t('lang_ukrainian')}</option>
          <option value="de">{t('lang_german')}</option>
          <option value="fr">{t('lang_french')}</option>
          <option value="es">{t('lang_spanish')}</option>
          <option value="multi">{t('lang_auto')}</option>
        </select>
      </div>

      {sttSettings.provider === 'local_whisper' && (
        <div className="settings-group">
          <h3>{t('whisper_models')}</h3>
          <div className="stt-models-list">
            {whisperModels.map((model) => (
              <div key={model.name} className="stt-model-item">
                <div className="stt-model-info">
                  <div className="stt-model-name">
                    {model.name}
                    {sttSettings.whisper_model === model.name && (
                      <span className="stt-model-active"> {t('model_active')}</span>
                    )}
                  </div>
                  <div className="stt-model-size">
                    {model.downloaded && model.size ? formatSize(model.size) : (
                      model.name === 'tiny' ? '~75 MB' : model.name === 'base' ? '~142 MB' : '~466 MB'
                    )}
                  </div>
                </div>
                <div className="stt-model-actions">
                  {model.downloaded ? (
                    <>
                      <span className="stt-model-downloaded">{t('downloaded')}</span>
                      {sttSettings.whisper_model !== model.name && (
                        <button className="stt-model-select-btn" onClick={() => saveSttSettings({ whisper_model: model.name })}>{t('select')}</button>
                      )}
                    </>
                  ) : (
                    <button className="stt-model-download-btn" disabled={sttLoading || downloadingModel !== null} onClick={() => handleDownloadModel(model.name)}>
                      {downloadingModel === model.name ? t('downloading_model') : t('download')}
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

  const renderHotkeysSettings = () => (
    <div className="settings-content">
      <div className="settings-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('hotkeys')}</h2>
        <button className="text-button" onClick={resetDefaults}>{t('reset_defaults')}</button>
      </div>
      <div className="settings-group">
        <h3>{t('app_shortcuts')}</h3>
        {hotkeys.map((hotkey) => (
          <div key={hotkey.id} className={`settings-item clickable ${listeningForKey === hotkey.id ? 'active-listening' : ''}`} onClick={() => setListeningForKey(listeningForKey === hotkey.id ? null : hotkey.id)}>
            <div className="settings-item-label">
              <div className="settings-item-title">{hotkey.label}</div>
              <div className="settings-item-description">{hotkey.description}</div>
            </div>
            <div className="settings-item-value hotkey-badge">
              {listeningForKey === hotkey.id ? (
                <span className="listening-text">{t('press_keys')}</span>
              ) : (
                hotkey.keys.map(k => k === 'Meta' ? '⌘' : k).join(' + ')
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLanguageSettings = () => (
    <div className="settings-content">
      <h2>{t('language')}</h2>
      <div className="settings-group">
        {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
          <div
            key={lang}
            className={`settings-item clickable ${lang === language ? 'active-listening' : ''}`}
            onClick={() => setLanguage(lang)}
          >
            <div className="settings-item-label">
              <div className="settings-item-title">{LANGUAGE_LABELS[lang]}</div>
            </div>
            {lang === language && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSettings();
      case 'privacy': return renderPrivacySettings();
      case 'data': return renderDataSettings();
      case 'downloads': return renderDownloadsSettings();
      case 'stt': return renderSttSettings();
      case 'hotkeys': return renderHotkeysSettings();
      case 'language': return renderLanguageSettings();
      case 'folders':
        return (<div className="settings-content"><h2>{t('nav_folders')}</h2><p className="settings-placeholder">{t('feature_in_dev')}</p></div>);
      case 'devices':
        return (<div className="settings-content"><h2>{t('nav_devices')}</h2><p className="settings-placeholder">{t('feature_in_dev')}</p></div>);
      default: return null;
    }
  };

  return (
    <>
      <div className="account-settings-overlay" onClick={onClose}>
        <div className="account-settings" onClick={(e) => e.stopPropagation()}>
          <aside className="settings-sidebar">
            <div className="settings-sidebar-header">
              <button className="icon-button" onClick={onClose} title={t('close')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h2>{t('settings')}</h2>
            </div>

            <div className="settings-profile" onClick={() => setShowProfileEdit(true)} style={{ cursor: 'pointer' }}>
              <div className="settings-profile-avatar">
                {activeAccount?.userInfo?.first_name?.substring(0, 1)?.toUpperCase() || 'ME'}
              </div>
              <div className="settings-profile-info">
                <div className="settings-profile-name">{activeAccount?.userInfo?.first_name || 'User'}</div>
                <div className="settings-profile-phone">{activeAccount?.userInfo?.phone || ''}</div>
              </div>
            </div>

            <nav className="settings-nav">
              <button className={`settings-nav-item ${activeSection === 'general' ? 'active' : ''}`} onClick={() => setActiveSection('general')}>
                <span className="settings-nav-icon">⚙️</span>{t('nav_general')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'privacy' ? 'active' : ''}`} onClick={() => setActiveSection('privacy')}>
                <span className="settings-nav-icon">🔒</span>{t('nav_privacy')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'data' ? 'active' : ''}`} onClick={() => setActiveSection('data')}>
                <span className="settings-nav-icon">💾</span>{t('nav_data')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'downloads' ? 'active' : ''}`} onClick={() => setActiveSection('downloads')}>
                <span className="settings-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                {t('nav_downloads')}
                {(active + queued > 0) && <span className="settings-nav-badge">{active + queued}</span>}
              </button>
              <button className={`settings-nav-item ${activeSection === 'stt' ? 'active' : ''}`} onClick={() => setActiveSection('stt')}>
                <span className="settings-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </span>
                {t('nav_voice')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'hotkeys' ? 'active' : ''}`} onClick={() => setActiveSection('hotkeys')}>
                <span className="settings-nav-icon">⌨️</span>{t('nav_hotkeys')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'folders' ? 'active' : ''}`} onClick={() => setActiveSection('folders')}>
                <span className="settings-nav-icon">📁</span>{t('nav_folders')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'devices' ? 'active' : ''}`} onClick={() => setActiveSection('devices')}>
                <span className="settings-nav-icon">📱</span>{t('nav_devices')}
              </button>
              <button className={`settings-nav-item ${activeSection === 'language' ? 'active' : ''}`} onClick={() => setActiveSection('language')}>
                <span className="settings-nav-icon">🌐</span>{t('nav_language')}
              </button>
            </nav>

            <div className="settings-sidebar-footer">
              <button className="settings-nav-item logout-button" onClick={handleLogout} disabled={loggingOut}>
                <span className="settings-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </span>
                {loggingOut ? t('logging_out') : t('log_out')}
              </button>
            </div>
          </aside>

          <main className="settings-main">
            <button className="settings-close" onClick={onClose}>✕</button>
            {renderContent()}
          </main>
        </div>
      </div>

      {showProfileEdit && <ProfileSettings onClose={() => setShowProfileEdit(false)} />}
    </>
  );
};

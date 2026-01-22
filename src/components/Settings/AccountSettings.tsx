import { useState } from 'react';
import { ProfileSettings } from './ProfileSettings';
import { useAccountsStore } from '../../store/accountsStore';
import { useThemeStore, ThemeSetting } from '../../store/themeStore';
import './AccountSettings.css';

interface AccountSettingsProps {
  onClose: () => void;
}

type SettingsSection = 'general' | 'privacy' | 'data' | 'folders' | 'devices' | 'language';

export const AccountSettings = ({ onClose }: AccountSettingsProps) => {
  const { getActiveAccount } = useAccountsStore();
  const { themeSetting, setThemeSetting } = useThemeStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [showProfileEdit, setShowProfileEdit] = useState(false);

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

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'privacy':
        return renderPrivacySettings();
      case 'data':
        return renderDataSettings();
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
            <div
              className="settings-profile"
              onClick={() => setShowProfileEdit(true)}
              style={{ cursor: 'pointer' }}
            >
              <div className="settings-profile-avatar">
                {activeAccount?.phone?.substring(0, 2) || 'ME'}
              </div>
              <div className="settings-profile-info">
                <div className="settings-profile-name">
                  {activeAccount?.userInfo?.firstName || 'Пользователь'}
                </div>
                <div className="settings-profile-phone">{activeAccount?.phone || ''}</div>
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

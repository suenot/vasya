import { useState } from 'react';
import { useAccountsStore } from '../../store/accountsStore';
import './ProfileSettings.css';

interface ProfileSettingsProps {
  onClose: () => void;
}

export const ProfileSettings = ({ onClose }: ProfileSettingsProps) => {
  const { getActiveAccount } = useAccountsStore();
  const activeAccount = getActiveAccount();

  const [firstName, setFirstName] = useState(activeAccount?.userInfo?.firstName || '');
  const [lastName, setLastName] = useState(activeAccount?.userInfo?.lastName || '');
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState(activeAccount?.userInfo?.username || '');

  const handleSave = () => {
    // TODO: Реализовать сохранение профиля через Tauri команду
    console.log('Saving profile:', { firstName, lastName, bio, username });
    onClose();
  };

  return (
    <div className="profile-settings-overlay" onClick={onClose}>
      <div className="profile-settings" onClick={(e) => e.stopPropagation()}>
        <header className="profile-settings-header">
          <button className="profile-back-button" onClick={onClose}>
            ‹
          </button>
          <h2>Редактировать профиль</h2>
          <button className="profile-save-button" onClick={handleSave}>
            Готово
          </button>
        </header>

        <div className="profile-settings-content">
          {/* Аватар */}
          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {activeAccount?.phone?.substring(0, 2) || 'ME'}
            </div>
            <button className="profile-avatar-upload">Загрузить фото</button>
          </div>

          {/* Форма */}
          <div className="profile-form">
            <div className="profile-form-group">
              <label htmlFor="firstName">Имя</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Введите имя"
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="lastName">Фамилия</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Введите фамилию"
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="bio">О себе</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Добавьте несколько слов о себе"
                rows={4}
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="username">Имя пользователя</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
              />
              <span className="profile-form-hint">
                Можно использовать a-z, 0-9 и подчёркивания. Минимум 5 символов.
              </span>
            </div>
          </div>

          {/* Информация о профиле */}
          <div className="profile-info-section">
            <h3>Информация</h3>
            <div className="profile-info-item">
              <span className="profile-info-label">Телефон</span>
              <span className="profile-info-value">{activeAccount?.phone || 'Не указан'}</span>
            </div>
            <div className="profile-info-item">
              <span className="profile-info-label">ID аккаунта</span>
              <span className="profile-info-value">{activeAccount?.id || 'Не указан'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

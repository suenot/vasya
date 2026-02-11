import { useState } from 'react';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { useAuthStore } from '../../store/authStore';
import { useAccountsStore } from '../../store/accountsStore';
import { UserInfo } from '../../types/telegram';
import './LoginForm.css';

interface AuthToken {
  token_data: string;
  phone: string;
}

export const LoginForm = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [error, setError] = useState('');
  const [authToken, setAuthToken] = useState<string>('');

  const { setUser, setLoading } = useAuthStore();
  const { addAccount } = useAccountsStore();
  const requestLoginCode = useTauriCommand<AuthToken, { phone: string }>('request_login_code');
  const verifyCode = useTauriCommand<UserInfo, { token: string; code: string }>('verify_code');
  const checkPassword = useTauriCommand<UserInfo, { accountId: string; password: string }>('check_password');

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('Введите номер телефона');
      return;
    }

    try {
      setLoading(true);
      const result = await requestLoginCode({ phone });
      setAuthToken(result.token_data);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при запросе кода');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Введите код подтверждения');
      return;
    }

    try {
      setLoading(true);
      const user = await verifyCode({ token: authToken, code });
      addAccount(authToken, user);
      setUser(user);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('2FA') || errorMsg.includes('password required')) {
        setStep('2fa');
        setError('');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Введите пароль 2FA');
      return;
    }

    try {
      setLoading(true);
      const user = await checkPassword({ accountId: authToken, password });
      addAccount(authToken, user);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === '2fa') {
      setStep('code');
      setPassword('');
    } else if (step === 'code') {
      setStep('phone');
      setCode('');
      setAuthToken('');
    }
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <img src="/vasyapp.svg" alt="Vasyapp Logo" className="login-logo" />
        </div>
        <h1 className="login-title">Vasyapp</h1>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="login-form">
            <p className="login-subtitle">Введите номер телефона для входа</p>
            <input type="tel" className="login-input" placeholder="+7 900 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button">Продолжить</button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <p className="login-subtitle">Мы отправили код в Telegram на<br /><strong>{phone}</strong></p>
            <input type="text" className="login-input" placeholder="Код подтверждения" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} autoFocus />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button">Войти</button>
            <button type="button" className="login-button-secondary" onClick={handleBack}>Изменить номер</button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handlePasswordSubmit} className="login-form">
            <p className="login-subtitle">У вас включена двухфакторная аутентификация<br />Введите пароль облачного хранилища</p>
            <input type="password" className="login-input" placeholder="Пароль 2FA" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button">Подтвердить</button>
            <button type="button" className="login-button-secondary" onClick={handleBack}>Назад</button>
          </form>
        )}
      </div>
    </div>
  );
};

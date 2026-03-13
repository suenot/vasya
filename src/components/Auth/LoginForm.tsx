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

interface LoginFormProps {
  onCancel?: () => void;
}

/** Format phone: keep +, digits only, insert spaces as +X XXX XXX XX XX */
const formatPhone = (value: string): string => {
  const digits = value.replace(/[^\d+]/g, '');
  const hasPlus = digits.startsWith('+');
  const nums = digits.replace(/\D/g, '');

  if (!nums) return hasPlus ? '+' : '';

  // Format: +X XXX XXX XX XX (international, flexible)
  let formatted = '+';
  for (let i = 0; i < nums.length && i < 15; i++) {
    if (i === 1 || i === 4 || i === 7 || i === 9 || i === 11) {
      formatted += ' ';
    }
    formatted += nums[i];
  }
  return formatted;
};

/** Strip formatting, return raw phone for API */
const stripPhone = (formatted: string): string => {
  const nums = formatted.replace(/\D/g, '');
  return nums ? '+' + nums : '';
};

export const LoginForm = ({ onCancel }: LoginFormProps) => {
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [error, setError] = useState('');
  const [authToken, setAuthToken] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const { setUser, setLoading } = useAuthStore();
  const { addAccount } = useAccountsStore();
  const requestLoginCode = useTauriCommand<AuthToken, { phone: string }>('request_login_code');
  const verifyCode = useTauriCommand<UserInfo, { token: string; code: string }>('verify_code');
  const checkPassword = useTauriCommand<UserInfo, { accountId: string; password: string }>('check_password');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const raw = stripPhone(phone);
    if (raw.length < 8) {
      setError('Введите номер телефона');
      return;
    }

    try {
      setSubmitting(true);
      setLoading(true);
      const result = await requestLoginCode({ phone: raw });
      setAuthToken(result.token_data);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при запросе кода');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Введите код подтверждения');
      return;
    }

    try {
      setSubmitting(true);
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
      setSubmitting(false);
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
      setSubmitting(true);
      setLoading(true);
      const user = await checkPassword({ accountId: authToken, password });
      addAccount(authToken, user);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный пароль');
    } finally {
      setSubmitting(false);
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
            <input
              type="tel"
              className="login-input"
              placeholder="+7 900 123 45 67"
              value={phone}
              onChange={handlePhoneChange}
              disabled={submitting}
              autoFocus
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Отправка...' : 'Продолжить'}
            </button>
            {onCancel && <button type="button" className="login-button-secondary" onClick={onCancel} disabled={submitting}>Отмена</button>}
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <p className="login-subtitle">Мы отправили код в Telegram на<br /><strong>{phone}</strong></p>
            <input
              type="text"
              className="login-input login-input-code"
              placeholder="_ _ _ _ _ _"
              value={code}
              onChange={handleCodeChange}
              disabled={submitting}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Проверка...' : 'Войти'}
            </button>
            <button type="button" className="login-button-secondary" onClick={handleBack} disabled={submitting}>Изменить номер</button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handlePasswordSubmit} className="login-form">
            <p className="login-subtitle">У вас включена двухфакторная аутентификация<br />Введите пароль облачного хранилища</p>
            <input
              type="password"
              className="login-input"
              placeholder="Пароль 2FA"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Проверка...' : 'Подтвердить'}
            </button>
            <button type="button" className="login-button-secondary" onClick={handleBack} disabled={submitting}>Назад</button>
          </form>
        )}
      </div>
    </div>
  );
};

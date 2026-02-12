import { useState } from 'react';
import { useAccountsStore } from '../../store/accountsStore';
import './AccountSwitcher.css';

export const AccountSwitcher = () => {
  const { accounts, activeAccountId, setActiveAccount, clearActiveAccount, removeAccount } = useAccountsStore();
  const [isOpen, setIsOpen] = useState(false);

  if (accounts.length === 0) {
    return null;
  }

  const activeAccount = accounts.find(acc => acc.id === activeAccountId);

  const handleSwitch = (accountId: string) => {
    setActiveAccount(accountId);
    setIsOpen(false);
  };

  const handleRemove = (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this account?')) {
      removeAccount(accountId);
    }
  };

  const handleAddAccount = () => {
    clearActiveAccount();
    setIsOpen(false);
  };

  return (
    <div className="account-switcher">
      <button
        className="account-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="account-avatar">
          {activeAccount?.userInfo.first_name.charAt(0).toUpperCase()}
        </div>
        <div className="account-info">
          <div className="account-name">
            {activeAccount?.userInfo.first_name} {activeAccount?.userInfo.last_name || ''}
          </div>
          <div className="account-phone">{activeAccount?.userInfo.phone}</div>
        </div>
        <svg
          className={`account-arrow ${isOpen ? 'open' : ''}`}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="account-switcher-dropdown">
          <div className="account-list">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`account-item ${account.id === activeAccountId ? 'active' : ''}`}
                onClick={() => handleSwitch(account.id)}
              >
                <div className="account-avatar small">
                  {account.userInfo.first_name.charAt(0).toUpperCase()}
                </div>
                <div className="account-details">
                  <div className="account-name">
                    {account.userInfo.first_name} {account.userInfo.last_name || ''}
                  </div>
                  <div className="account-phone">{account.userInfo.phone}</div>
                </div>
                {account.id !== activeAccountId && (
                  <button
                    className="account-remove"
                    onClick={(e) => handleRemove(account.id, e)}
                    title="Remove account"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="add-account-button" onClick={handleAddAccount}>
            + Add account
          </button>
        </div>
      )}
    </div>
  );
};

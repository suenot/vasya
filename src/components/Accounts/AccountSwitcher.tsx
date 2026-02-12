import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useAccountsStore } from '../../store/accountsStore';
import './AccountSwitcher.css';

export const AccountSwitcher = () => {
  const { accounts, activeAccountId, setActiveAccount, clearActiveAccount } = useAccountsStore();
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    accounts.forEach(acc => {
      invoke<string | null>('get_my_avatar', { accountId: acc.id })
        .then((path) => {
          if (path) {
            setAvatars(prev => ({ ...prev, [acc.id]: path }));
          }
        })
        .catch(() => { });
    });
  }, [accounts]);

  const handleSwitch = (accountId: string) => {
    if (accountId === activeAccountId) return;
    setActiveAccount(accountId);
  };

  const handleAddAccount = () => {
    clearActiveAccount();
  };

  if (accounts.length === 0) {
    return (
      <div className="account-circles">
        <button
          className="account-circle add-account"
          onClick={handleAddAccount}
          title="Add account"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    );
  }

  // Sort accounts so active is last (on top) or first? 
  // User says "группа кружочков раздвигается". Usually they overlap and then spread.
  return (
    <div className="account-circles">
      <div className="circles-group">
        {accounts.map((account, index) => (
          <button
            key={account.id}
            className={`account-circle ${account.id === activeAccountId ? 'active' : ''}`}
            onClick={() => handleSwitch(account.id)}
            style={{ '--index': index } as React.CSSProperties}
            title={`${account.userInfo.first_name} ${account.userInfo.last_name || ''}`}
          >
            {avatars[account.id] ? (
              <img src={convertFileSrc(avatars[account.id])} alt="" className="avatar-image" />
            ) : (
              <div className="avatar-placeholder">
                {account.userInfo.first_name.charAt(0).toUpperCase()}
              </div>
            )}
          </button>
        ))}
        <button
          className="account-circle add-account"
          onClick={handleAddAccount}
          style={{ '--index': accounts.length } as React.CSSProperties}
          title="Add account"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

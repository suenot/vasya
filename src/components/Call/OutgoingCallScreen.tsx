import { useCallStore } from '../../store/callStore';
import { useAccountsStore } from '../../store/accountsStore';
import { useTranslation } from '../../i18n';

const AVATAR_COLORS = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#d63031', '#fdcb6e', '#e84393', '#00cec9'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export function OutgoingCallScreen() {
  const { t } = useTranslation();
  const activeCall = useCallStore((s) => s.activeCall);
  const discardCall = useCallStore((s) => s.discardCall);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  if (!activeCall) return null;

  const initials = getInitials(activeCall.peerName);
  const avatarColor = getAvatarColor(activeCall.peerName);
  const statusText = activeCall.state === 'requesting' ? t('call_connecting') : t('call_outgoing');

  return (
    <div className="call-overlay">
      <div className="call-overlay-bg" />
      <div className="call-overlay-content">
        <div className="call-pulse-ring">
          <div className="call-avatar" style={{ background: avatarColor }}>
            {initials}
          </div>
        </div>

        <div className="call-peer-name">{activeCall.peerName}</div>
        <div className="call-status">{statusText}</div>

        <div className="call-actions">
          <div className="call-action-group">
            <button
              className="call-action-btn call-action-btn--hangup"
              onClick={() => activeAccountId && discardCall(activeAccountId, 'hangup')}
              title={t('call_cancel')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
            <span className="call-action-label">{t('call_cancel')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useCallStore } from '../../store/callStore';
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

export function IncomingCallDialog() {
  const { t } = useTranslation();
  const incomingCall = useCallStore((s) => s.incomingCall);
  const acceptCall = useCallStore((s) => s.acceptCall);
  const discardCall = useCallStore((s) => s.discardCall);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-decline after 30 seconds
  useEffect(() => {
    if (!incomingCall) return;

    timerRef.current = setTimeout(() => {
      discardCall(incomingCall.accountId, 'missed');
    }, 30000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [incomingCall, discardCall]);

  if (!incomingCall) return null;

  const initials = getInitials(incomingCall.userName);
  const avatarColor = getAvatarColor(incomingCall.userName);

  return (
    <div className="call-overlay">
      <div className="call-overlay-bg" />
      <div className="call-overlay-content">
        <div className={`call-pulse-ring call-pulse-ring--incoming`}>
          <div className="call-avatar" style={{ background: avatarColor }}>
            {initials}
          </div>
        </div>

        <div className="call-peer-name">{incomingCall.userName}</div>
        <div className="call-incoming-text">
          {incomingCall.isVideo ? t('call_incoming_video') : t('call_incoming')}
        </div>

        <div className="call-actions">
          <div className="call-action-group">
            <button
              className="call-action-btn call-action-btn--decline"
              onClick={() => discardCall(incomingCall.accountId, 'busy')}
              title={t('call_decline')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
            <span className="call-action-label">{t('call_decline')}</span>
          </div>

          <div className="call-action-group">
            <button
              className="call-action-btn call-action-btn--accept"
              onClick={() => acceptCall(incomingCall.accountId)}
              title={t('call_accept')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
            <span className="call-action-label">{t('call_accept')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

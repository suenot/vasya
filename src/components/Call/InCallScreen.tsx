import { useState, useEffect, useRef } from 'react';
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function InCallScreen() {
  const { t } = useTranslation();
  const activeCall = useCallStore((s) => s.activeCall);
  const discardCall = useCallStore((s) => s.discardCall);
  const isMuted = useCallStore((s) => s.isMuted);
  const audioLevel = useCallStore((s) => s.audioLevel);
  const networkQuality = useCallStore((s) => s.networkQuality);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  const [isSpeaker, setIsSpeaker] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Duration timer
  useEffect(() => {
    if (!activeCall?.startTime) {
      setElapsed(0);
      return;
    }

    const update = () => {
      setElapsed(Math.floor((Date.now() - activeCall.startTime!) / 1000));
    };
    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeCall?.startTime]);

  if (!activeCall) return null;

  const initials = getInitials(activeCall.peerName);
  const avatarColor = getAvatarColor(activeCall.peerName);
  const isConnecting = activeCall.state === 'accepted' || activeCall.state === 'requesting' || activeCall.state === 'waiting';
  const statusText = isConnecting
    ? t('call_connecting')
    : isMuted
      ? t('call_muted')
      : formatDuration(elapsed);

  return (
    <div className="call-overlay">
      <div className="call-overlay-bg" />
      <div className="call-overlay-content">
        <div className="call-avatar" style={{ background: avatarColor }}>
          {initials}
        </div>

        <div className="call-peer-name">{activeCall.peerName}</div>
        <div className="call-timer">{statusText}</div>

        {activeCall.state === 'active' && (
          <div className="call-indicators">
            <div className="call-audio-level">
              <div
                className="call-audio-level-bar"
                style={{ height: `${Math.min(audioLevel * 100, 100)}%` }}
              />
            </div>
            <div className="call-network-quality">
              {[1, 2, 3, 4, 5].map((dot) => (
                <span
                  key={dot}
                  className={`call-network-dot ${dot <= networkQuality ? 'call-network-dot--active' : ''}`}
                />
              ))}
              {networkQuality <= 2 && (
                <span className="call-poor-connection">{t('call_poor_connection')}</span>
              )}
            </div>
          </div>
        )}

        <div className="call-actions">
          <div className="call-action-group">
            <button
              className={`call-action-btn call-action-btn--toggle ${isMuted ? 'active' : ''}`}
              onClick={() => activeAccountId && toggleMute(activeAccountId)}
              title={isMuted ? t('call_unmute') : t('call_mute')}
            >
              {isMuted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <span className="call-action-label">{isMuted ? t('call_unmute') : t('call_mute')}</span>
          </div>

          <div className="call-action-group">
            <button
              className="call-action-btn call-action-btn--hangup"
              onClick={() => activeAccountId && discardCall(activeAccountId, 'hangup')}
              title={t('call_hang_up')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
            <span className="call-action-label">{t('call_hang_up')}</span>
          </div>

          <div className="call-action-group">
            <button
              className={`call-action-btn call-action-btn--toggle ${isSpeaker ? 'active' : ''}`}
              onClick={() => setIsSpeaker(!isSpeaker)}
              title={t('call_speaker')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {isSpeaker ? (
                  <>
                    <path d="M19.07 4.93a10 10 0 010 14.14" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" />
                  </>
                ) : (
                  <path d="M15.54 8.46a5 5 0 010 7.07" />
                )}
              </svg>
            </button>
            <span className="call-action-label">{t('call_speaker')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

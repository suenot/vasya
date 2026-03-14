import { useState, useRef, useEffect } from 'react';
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
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0]?.toUpperCase() || '?';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoCallScreen() {
  const { t } = useTranslation();
  const activeCall = useCallStore((s) => s.activeCall);
  const discardCall = useCallStore((s) => s.discardCall);
  const isMuted = useCallStore((s) => s.isMuted);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Call duration timer
  useEffect(() => {
    if (!activeCall?.startTime) return;
    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - activeCall.startTime!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startTime]);

  if (!activeCall) return null;

  const initials = getInitials(activeCall.peerName);
  const avatarColor = getAvatarColor(activeCall.peerName);

  if (isMinimized) {
    return (
      <div className="video-call-minimized" onClick={() => setIsMinimized(false)}>
        <div className="video-call-minimized-info">
          <div className="video-call-minimized-avatar" style={{ background: avatarColor }}>
            {initials}
          </div>
          <div className="video-call-minimized-details">
            <span className="video-call-minimized-name">{activeCall.peerName}</span>
            <span className="video-call-minimized-duration">{formatDuration(callDuration)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="call-overlay video-call-screen">
      <div className="call-overlay-bg" />

      {/* Remote video or avatar fallback */}
      <div className="video-call-remote">
        <video
          ref={remoteVideoRef}
          className="video-call-remote-video"
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
        <div className="video-call-remote-placeholder">
          <div className="video-call-large-avatar" style={{ background: avatarColor }}>
            {initials}
          </div>
        </div>
      </div>

      {/* Local PiP video preview */}
      <div className="video-call-pip">
        <video
          ref={localVideoRef}
          className="video-call-local-video"
          autoPlay
          playsInline
          muted
          style={{ display: isVideoEnabled ? 'block' : 'none' }}
        />
        {!isVideoEnabled && (
          <div className="video-call-pip-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m2-2h8a2 2 0 012 2v1m4 4v5" />
            </svg>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="video-call-top-bar">
        <div className="video-call-peer-name">{activeCall.peerName}</div>
        <div className="video-call-duration">{formatDuration(callDuration)}</div>
      </div>

      {/* Bottom action buttons */}
      <div className="video-call-bottom-bar">
        <div className="call-action-group">
          <button
            className={`call-action-btn call-action-btn--toggle ${!isVideoEnabled ? 'active' : ''}`}
            onClick={() => setIsVideoEnabled(!isVideoEnabled)}
            title={isVideoEnabled ? t('call_video_off') : t('call_video_on')}
          >
            {isVideoEnabled ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
          <span className="call-action-label">{isVideoEnabled ? t('call_video_on') : t('call_video_off')}</span>
        </div>

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
            className="call-action-btn call-action-btn--toggle"
            onClick={() => setIsMinimized(true)}
            title={t('call_minimize')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <span className="call-action-label">{t('call_minimize')}</span>
        </div>
      </div>
    </div>
  );
}

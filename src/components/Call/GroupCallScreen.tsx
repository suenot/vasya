import { useEffect } from 'react';
import { useGroupCallStore, GroupCallParticipant } from '../../store/groupCallStore';
import { useTranslation } from '../../i18n';

const AVATAR_COLORS = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#d63031', '#fdcb6e', '#e84393', '#00cec9'];

function getAvatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0]?.toUpperCase() || '?';
}

function ParticipantCard({ participant }: { participant: GroupCallParticipant }) {
  const { t } = useTranslation();
  const name = participant.name || `User ${participant.userId}`;
  const initials = getInitials(name);
  const avatarColor = getAvatarColor(participant.userId);

  return (
    <div className={`group-call-participant ${participant.isSpeaking ? 'group-call-participant--speaking' : ''}`}>
      <div className="group-call-participant-avatar-wrap">
        <div
          className="group-call-participant-avatar"
          style={{ background: avatarColor }}
        >
          {initials}
        </div>
        {participant.isSpeaking && (
          <div className="group-call-speaking-ring" />
        )}
      </div>
      <div className="group-call-participant-name">
        {name}
        {participant.isSelf && <span className="group-call-participant-self"> ({t('call_muted').split(' ')[0]})</span>}
      </div>
      <div className="group-call-participant-status">
        {participant.isMuted ? (
          <svg className="group-call-muted-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93" />
          </svg>
        ) : participant.isSpeaking ? (
          <span className="group-call-speaking-text">{t('group_call_speaking')}</span>
        ) : null}
        {participant.raiseHandRating != null && participant.raiseHandRating > 0 && (
          <span className="group-call-raise-hand" title={t('group_call_raise_hand')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fdcb6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 00-4 0v1" />
              <path d="M14 10V4a2 2 0 00-4 0v6" />
              <path d="M10 10.5V6a2 2 0 00-4 0v8" />
              <path d="M18 8a2 2 0 014 0v6a8 8 0 01-8 8H9a8 8 0 01-5.66-2.34" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

export function GroupCallScreen({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const activeGroupCall = useGroupCallStore((s) => s.activeGroupCall);
  const participants = useGroupCallStore((s) => s.participants);
  const isMuted = useGroupCallStore((s) => s.isMuted);
  const leaveGroupCall = useGroupCallStore((s) => s.leaveGroupCall);
  const toggleMute = useGroupCallStore((s) => s.toggleMute);
  const loadParticipants = useGroupCallStore((s) => s.loadParticipants);

  // Periodically refresh participants
  useEffect(() => {
    if (!activeGroupCall || activeGroupCall.state !== 'active') return;
    loadParticipants(accountId);
    const interval = setInterval(() => {
      loadParticipants(accountId);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeGroupCall?.state, activeGroupCall?.callId, accountId, loadParticipants]);

  if (!activeGroupCall) return null;

  const title = activeGroupCall.title || t('group_call');

  return (
    <div className="call-overlay group-call-screen">
      <div className="call-overlay-bg" />
      <div className="group-call-content">
        {/* Header */}
        <div className="group-call-header">
          <div className="group-call-title">{title}</div>
          <div className="group-call-count">
            {t('group_call_participants')}: {activeGroupCall.participantsCount}
          </div>
        </div>

        {/* Participant grid */}
        <div className="group-call-grid">
          {participants.map((p) => (
            <ParticipantCard key={p.userId} participant={p} />
          ))}
          {participants.length === 0 && (
            <div className="group-call-empty">
              {t('group_call_participants')}: 0
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="group-call-bottom-bar">
          <div className="call-action-group">
            <button
              className={`call-action-btn call-action-btn--toggle ${isMuted ? 'active' : ''}`}
              onClick={() => toggleMute(accountId)}
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
              onClick={() => leaveGroupCall(accountId)}
              title={t('group_call_leave')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
            <span className="call-action-label">{t('group_call_leave')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

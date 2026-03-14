import { createPortal } from 'react-dom';
import { useCallStore } from '../../store/callStore';
import { useGroupCallStore } from '../../store/groupCallStore';
import { useAccountsStore } from '../../store/accountsStore';
import { IncomingCallDialog } from './IncomingCallDialog';
import { OutgoingCallScreen } from './OutgoingCallScreen';
import { InCallScreen } from './InCallScreen';
import { VideoCallScreen } from './VideoCallScreen';
import { GroupCallScreen } from './GroupCallScreen';
import './CallOverlay.css';

export function CallOverlay() {
  const incomingCall = useCallStore((s) => s.incomingCall);
  const activeCall = useCallStore((s) => s.activeCall);
  const activeGroupCall = useGroupCallStore((s) => s.activeGroupCall);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  let content: React.ReactNode = null;

  if (activeGroupCall && activeAccountId) {
    content = <GroupCallScreen accountId={activeAccountId} />;
  } else if (incomingCall) {
    content = <IncomingCallDialog />;
  } else if (activeCall) {
    const { state } = activeCall;
    if (state === 'requesting' || state === 'waiting' || state === 'ringing') {
      content = <OutgoingCallScreen />;
    } else if ((state === 'accepted' || state === 'active') && activeCall.isVideo) {
      content = <VideoCallScreen />;
    } else if (state === 'accepted' || state === 'active') {
      content = <InCallScreen />;
    }
  }

  if (!content) return null;

  return createPortal(content, document.body);
}

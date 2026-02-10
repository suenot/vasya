import { create } from 'zustand';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface ConnectionState {
  status: ConnectionStatus;
  lastConnected: number | null;

  setStatus: (status: ConnectionStatus) => void;
  setConnected: () => void;
  setDisconnected: () => void;
  setReconnecting: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  lastConnected: null,

  setStatus: (status) => set({ status }),
  setConnected: () => set({ status: 'connected', lastConnected: Date.now() }),
  setDisconnected: () => set({ status: 'disconnected' }),
  setReconnecting: () => set({ status: 'reconnecting' }),
}));

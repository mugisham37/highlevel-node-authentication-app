import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface OfflineAction {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  endpoint: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

export interface OfflineState {
  isOnline: boolean;
  queue: OfflineAction[];
  syncInProgress: boolean;
  lastSyncTime: number | null;
}

const initialState: OfflineState = {
  isOnline: true,
  queue: [],
  syncInProgress: false,
  lastSyncTime: null,
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    addToQueue: (
      state,
      action: PayloadAction<Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>>
    ) => {
      const newAction: OfflineAction = {
        ...action.payload,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        retryCount: 0,
      };
      state.queue.push(newAction);
    },
    removeFromQueue: (state, action: PayloadAction<string>) => {
      state.queue = state.queue.filter(item => item.id !== action.payload);
    },
    incrementRetryCount: (state, action: PayloadAction<string>) => {
      const item = state.queue.find(item => item.id === action.payload);
      if (item) {
        item.retryCount += 1;
      }
    },
    clearQueue: state => {
      state.queue = [];
    },
    setSyncInProgress: (state, action: PayloadAction<boolean>) => {
      state.syncInProgress = action.payload;
    },
    updateLastSyncTime: state => {
      state.lastSyncTime = Date.now();
    },
  },
});

export const {
  setOnlineStatus,
  addToQueue,
  removeFromQueue,
  incrementRetryCount,
  clearQueue,
  setSyncInProgress,
  updateLastSyncTime,
} = offlineSlice.actions;

export default offlineSlice.reducer;

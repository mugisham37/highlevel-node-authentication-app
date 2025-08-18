import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
  biometric: {
    enabled: boolean;
    type: string | null;
  };
}

export interface UserState {
  preferences: UserPreferences;
  deviceInfo: {
    deviceId: string | null;
    deviceName: string | null;
    platform: string;
    version: string | null;
  };
  sessions: Array<{
    id: string;
    deviceName: string;
    lastActive: number;
    current: boolean;
  }>;
}

const initialState: UserState = {
  preferences: {
    theme: 'system',
    language: 'en',
    notifications: {
      push: true,
      email: true,
      sms: false,
    },
    biometric: {
      enabled: false,
      type: null,
    },
  },
  deviceInfo: {
    deviceId: null,
    deviceName: null,
    platform: 'unknown',
    version: null,
  },
  sessions: [],
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    updatePreferences: (state, action: PayloadAction<Partial<UserPreferences>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
    },
    updateNotificationPreferences: (
      state,
      action: PayloadAction<Partial<UserPreferences['notifications']>>
    ) => {
      state.preferences.notifications = {
        ...state.preferences.notifications,
        ...action.payload,
      };
    },
    updateBiometricPreferences: (
      state,
      action: PayloadAction<Partial<UserPreferences['biometric']>>
    ) => {
      state.preferences.biometric = {
        ...state.preferences.biometric,
        ...action.payload,
      };
    },
    setDeviceInfo: (state, action: PayloadAction<Partial<UserState['deviceInfo']>>) => {
      state.deviceInfo = { ...state.deviceInfo, ...action.payload };
    },
    setSessions: (state, action: PayloadAction<UserState['sessions']>) => {
      state.sessions = action.payload;
    },
    addSession: (state, action: PayloadAction<UserState['sessions'][0]>) => {
      state.sessions.push(action.payload);
    },
    removeSession: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter(session => session.id !== action.payload);
    },
    updateSessionActivity: (state, action: PayloadAction<{ id: string; lastActive: number }>) => {
      const session = state.sessions.find(s => s.id === action.payload.id);
      if (session) {
        session.lastActive = action.payload.lastActive;
      }
    },
  },
});

export const {
  updatePreferences,
  updateNotificationPreferences,
  updateBiometricPreferences,
  setDeviceInfo,
  setSessions,
  addSession,
  removeSession,
  updateSessionActivity,
} = userSlice.actions;

export default userSlice.reducer;

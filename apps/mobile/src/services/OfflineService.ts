import NetInfo from '@react-native-community/netinfo';
import { store } from '../store';
import {
  incrementRetryCount,
  removeFromQueue,
  setOnlineStatus,
  setSyncInProgress,
  updateLastSyncTime,
} from '../store/slices/offlineSlice';

class OfflineService {
  private static instance: OfflineService;
  private syncInterval: NodeJS.Timeout | null = null;
  private maxRetries = 3;

  private constructor() {
    this.initializeNetworkListener();
    this.startSyncInterval();
  }

  public static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  private initializeNetworkListener() {
    NetInfo.addEventListener(state => {
      const isOnline = state.isConnected && state.isInternetReachable;
      store.dispatch(setOnlineStatus(isOnline || false));

      if (isOnline) {
        this.syncOfflineActions();
      }
    });
  }

  private startSyncInterval() {
    // Sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      const state = store.getState();
      if (state.offline.isOnline && state.offline.queue.length > 0) {
        this.syncOfflineActions();
      }
    }, 30000);
  }

  public async syncOfflineActions() {
    const state = store.getState();

    if (
      !state.offline.isOnline ||
      state.offline.syncInProgress ||
      state.offline.queue.length === 0
    ) {
      return;
    }

    store.dispatch(setSyncInProgress(true));

    try {
      const actionsToSync = [...state.offline.queue];

      for (const action of actionsToSync) {
        try {
          await this.executeOfflineAction(action);
          store.dispatch(removeFromQueue(action.id));
        } catch (error) {
          console.error('Failed to sync action:', action, error);

          if (action.retryCount < this.maxRetries) {
            store.dispatch(incrementRetryCount(action.id));
          } else {
            // Remove action after max retries
            store.dispatch(removeFromQueue(action.id));
            console.warn('Action removed after max retries:', action);
          }
        }
      }

      store.dispatch(updateLastSyncTime());
    } finally {
      store.dispatch(setSyncInProgress(false));
    }
  }

  private async executeOfflineAction(action: any): Promise<void> {
    // TODO: Implement actual API calls using tRPC client
    // This will be connected to the API in a later integration task

    console.log('Executing offline action:', action);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // For now, just log the action that would be executed
    switch (action.type) {
      case 'CREATE':
        console.log(`Would CREATE at ${action.endpoint} with data:`, action.data);
        break;
      case 'UPDATE':
        console.log(`Would UPDATE at ${action.endpoint} with data:`, action.data);
        break;
      case 'DELETE':
        console.log(`Would DELETE at ${action.endpoint} with data:`, action.data);
        break;
    }
  }

  public addOfflineAction(type: 'CREATE' | 'UPDATE' | 'DELETE', endpoint: string, data: any) {
    const state = store.getState();

    if (!state.offline.isOnline) {
      store.dispatch({
        type: 'offline/addToQueue',
        payload: {
          type,
          endpoint,
          data,
        },
      });
    }
  }

  public destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export default OfflineService;

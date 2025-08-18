import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

class PushNotificationService {
  private static instance: PushNotificationService;

  private constructor() {}

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  public async initialize() {
    try {
      // Request permission for iOS
      if (Platform.OS === 'ios') {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
          console.log('Push notification permission denied');
          return false;
        }
      }

      // Request permission for Android (API level 33+)
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        if (permission) {
          const granted = await PermissionsAndroid.request(permission);

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Push notification permission denied');
            return false;
          }
        }
      }

      // Get FCM token
      const token = await messaging().getToken();
      console.log('FCM Token:', token);

      // Store token for API registration
      await AsyncStorage.setItem('fcm_token', token);

      // Set up message handlers
      this.setupMessageHandlers();

      return true;
    } catch (error) {
      console.error('Error initializing push notifications:', error);
      return false;
    }
  }

  private setupMessageHandlers() {
    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
      this.handleNotification(remoteMessage);
    });

    // Handle foreground messages
    messaging().onMessage(async remoteMessage => {
      console.log('Message handled in the foreground!', remoteMessage);
      this.handleNotification(remoteMessage);

      // Show alert for foreground messages
      if (remoteMessage.notification) {
        Alert.alert(
          remoteMessage.notification.title || 'Notification',
          remoteMessage.notification.body || 'You have a new message'
        );
      }
    });

    // Handle notification opened app
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('Notification caused app to open from background state:', remoteMessage);
      this.handleNotificationTap(remoteMessage);
    });

    // Check whether an initial notification is available
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log('Notification caused app to open from quit state:', remoteMessage);
          this.handleNotificationTap(remoteMessage);
        }
      });

    // Handle token refresh
    messaging().onTokenRefresh(token => {
      console.log('FCM Token refreshed:', token);
      AsyncStorage.setItem('fcm_token', token);
      // TODO: Send updated token to server
    });
  }

  private handleNotification(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    // Store notification in local storage for offline access
    this.storeNotification(remoteMessage);

    // Handle different notification types
    const notificationType = remoteMessage.data?.type;

    switch (notificationType) {
      case 'security_alert':
        this.handleSecurityAlert(remoteMessage);
        break;
      case 'login_attempt':
        this.handleLoginAttempt(remoteMessage);
        break;
      case 'account_update':
        this.handleAccountUpdate(remoteMessage);
        break;
      default:
        console.log('Unknown notification type:', notificationType);
    }
  }

  private handleNotificationTap(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    // Navigate to appropriate screen based on notification data
    const notificationType = remoteMessage.data?.type;
    const navigationData = remoteMessage.data?.navigation;

    console.log('Handle notification tap:', { notificationType, navigationData });

    // TODO: Implement navigation logic based on notification type
    // This will be integrated with React Navigation in the main app
  }

  private async storeNotification(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    try {
      const notifications = await this.getStoredNotifications();
      const newNotification = {
        id: remoteMessage.messageId || Date.now().toString(),
        title: remoteMessage.notification?.title || 'Notification',
        body: remoteMessage.notification?.body || '',
        data: remoteMessage.data || {},
        timestamp: Date.now(),
        read: false,
      };

      notifications.unshift(newNotification);

      // Keep only last 50 notifications
      const trimmedNotifications = notifications.slice(0, 50);

      await AsyncStorage.setItem('stored_notifications', JSON.stringify(trimmedNotifications));
    } catch (error) {
      console.error('Error storing notification:', error);
    }
  }

  public async getStoredNotifications() {
    try {
      const stored = await AsyncStorage.getItem('stored_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting stored notifications:', error);
      return [];
    }
  }

  public async markNotificationAsRead(notificationId: string) {
    try {
      const notifications = await this.getStoredNotifications();
      const updatedNotifications = notifications.map((notification: any) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      );

      await AsyncStorage.setItem('stored_notifications', JSON.stringify(updatedNotifications));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  private handleSecurityAlert(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    console.log('Security alert received:', remoteMessage);
    // TODO: Handle security-specific logic
  }

  private handleLoginAttempt(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    console.log('Login attempt notification received:', remoteMessage);
    // TODO: Handle login attempt notification
  }

  private handleAccountUpdate(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    console.log('Account update notification received:', remoteMessage);
    // TODO: Handle account update notification
  }

  public async getFCMToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('fcm_token');
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  public async subscribeTo(topic: string) {
    try {
      await messaging().subscribeToTopic(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Error subscribing to topic ${topic}:`, error);
    }
  }

  public async unsubscribeFrom(topic: string) {
    try {
      await messaging().unsubscribeFromTopic(topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error(`Error unsubscribing from topic ${topic}:`, error);
    }
  }
}

export default PushNotificationService;

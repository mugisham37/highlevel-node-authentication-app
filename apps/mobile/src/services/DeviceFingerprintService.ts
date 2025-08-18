import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import 'react-native-get-random-values'; // Required for crypto.getRandomValues()

interface DeviceFingerprint {
  deviceId: string;
  uniqueId: string;
  brand: string;
  model: string;
  systemName: string;
  systemVersion: string;
  buildNumber: string;
  bundleId: string;
  deviceName: string;
  deviceType: string;
  hasNotch: boolean;
  isTablet: boolean;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  carrier: string | null;
  totalMemory: number;
  usedMemory: number;
  totalStorage: number;
  availableStorage: number;
  batteryLevel: number;
  isCharging: boolean;
  fingerprint: string;
  createdAt: number;
}

class DeviceFingerprintService {
  private static instance: DeviceFingerprintService;
  private cachedFingerprint: DeviceFingerprint | null = null;

  private constructor() {}

  public static getInstance(): DeviceFingerprintService {
    if (!DeviceFingerprintService.instance) {
      DeviceFingerprintService.instance = new DeviceFingerprintService();
    }
    return DeviceFingerprintService.instance;
  }

  public async generateFingerprint(): Promise<DeviceFingerprint> {
    if (this.cachedFingerprint) {
      return this.cachedFingerprint;
    }

    try {
      const [
        deviceId,
        uniqueId,
        brand,
        model,
        systemName,
        systemVersion,
        buildNumber,
        bundleId,
        deviceName,
        deviceType,
        hasNotch,
        isTablet,
        batteryLevel,
        isCharging,
        totalMemory,
        usedMemory,
        totalStorage,
        availableStorage,
        carrier,
      ] = await Promise.all([
        DeviceInfo.getDeviceId(),
        DeviceInfo.getUniqueId(),
        DeviceInfo.getBrand(),
        DeviceInfo.getModel(),
        DeviceInfo.getSystemName(),
        DeviceInfo.getSystemVersion(),
        DeviceInfo.getBuildNumber(),
        DeviceInfo.getBundleId(),
        DeviceInfo.getDeviceName(),
        DeviceInfo.getDeviceType(),
        DeviceInfo.hasNotch(),
        DeviceInfo.isTablet(),
        DeviceInfo.getBatteryLevel(),
        DeviceInfo.isBatteryCharging(),
        DeviceInfo.getTotalMemory(),
        DeviceInfo.getUsedMemory(),
        DeviceInfo.getTotalDiskCapacity(),
        DeviceInfo.getFreeDiskStorage(),
        DeviceInfo.getCarrier().catch(() => null),
      ]);

      // Get screen dimensions
      const { Dimensions } = require('react-native');
      const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

      // Get timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Create fingerprint hash
      const fingerprintData = {
        deviceId,
        uniqueId,
        brand,
        model,
        systemName,
        systemVersion,
        buildNumber,
        bundleId,
        deviceType,
        hasNotch,
        isTablet,
        screenWidth,
        screenHeight,
        timezone,
        totalMemory,
        totalStorage,
      };

      const fingerprint = await this.createHash(JSON.stringify(fingerprintData));

      const deviceFingerprint: DeviceFingerprint = {
        deviceId,
        uniqueId,
        brand,
        model,
        systemName,
        systemVersion,
        buildNumber,
        bundleId,
        deviceName,
        deviceType,
        hasNotch,
        isTablet,
        screenWidth,
        screenHeight,
        timezone,
        carrier,
        totalMemory,
        usedMemory,
        totalStorage,
        availableStorage,
        batteryLevel,
        isCharging,
        fingerprint,
        createdAt: Date.now(),
      };

      this.cachedFingerprint = deviceFingerprint;

      // Store fingerprint for future use
      await this.storeFingerprint(deviceFingerprint);

      return deviceFingerprint;
    } catch (error) {
      console.error('Error generating device fingerprint:', error);
      throw error;
    }
  }

  private async createHash(data: string): Promise<string> {
    // Simple hash function for device fingerprinting
    // In a production app, you might want to use a more sophisticated hashing algorithm
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private async storeFingerprint(fingerprint: DeviceFingerprint): Promise<void> {
    try {
      await AsyncStorage.setItem('device_fingerprint', JSON.stringify(fingerprint));
    } catch (error) {
      console.error('Error storing device fingerprint:', error);
    }
  }

  public async getStoredFingerprint(): Promise<DeviceFingerprint | null> {
    try {
      const stored = await AsyncStorage.getItem('device_fingerprint');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error getting stored fingerprint:', error);
      return null;
    }
  }

  public async isDeviceChanged(): Promise<boolean> {
    try {
      const storedFingerprint = await this.getStoredFingerprint();
      if (!storedFingerprint) {
        return false; // No previous fingerprint to compare
      }

      const currentFingerprint = await this.generateFingerprint();

      // Compare critical device properties
      const criticalProps = [
        'deviceId',
        'uniqueId',
        'brand',
        'model',
        'systemName',
        'bundleId',
        'deviceType',
      ];

      for (const prop of criticalProps) {
        if (
          storedFingerprint[prop as keyof DeviceFingerprint] !==
          currentFingerprint[prop as keyof DeviceFingerprint]
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking device changes:', error);
      return false;
    }
  }

  public async getTrustedDeviceId(): Promise<string> {
    try {
      let trustedId = await AsyncStorage.getItem('trusted_device_id');

      if (!trustedId) {
        // Generate a new trusted device ID
        const fingerprint = await this.generateFingerprint();
        trustedId = `${fingerprint.deviceId}-${fingerprint.fingerprint}-${Date.now()}`;
        await AsyncStorage.setItem('trusted_device_id', trustedId);
      }

      return trustedId;
    } catch (error) {
      console.error('Error getting trusted device ID:', error);
      throw error;
    }
  }

  public async clearFingerprint(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(['device_fingerprint', 'trusted_device_id']);
      this.cachedFingerprint = null;
    } catch (error) {
      console.error('Error clearing fingerprint:', error);
    }
  }

  public getDeviceInfo(): Partial<DeviceFingerprint> {
    if (this.cachedFingerprint) {
      const { brand, model, systemName, systemVersion, deviceName, deviceType, isTablet } =
        this.cachedFingerprint;

      return {
        brand,
        model,
        systemName,
        systemVersion,
        deviceName,
        deviceType,
        isTablet,
      };
    }

    return {};
  }
}

export default DeviceFingerprintService;

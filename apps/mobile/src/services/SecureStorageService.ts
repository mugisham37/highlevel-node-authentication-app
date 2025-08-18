import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

interface SecureStorageOptions {
  accessControl?: Keychain.ACCESS_CONTROL;
  authenticationType?: Keychain.AUTHENTICATION_TYPE;
  accessGroup?: string;
  service?: string;
}

class SecureStorageService {
  private static instance: SecureStorageService;
  private defaultService = 'com.company.mobile.secure';

  private constructor() {}

  public static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  /**
   * Store sensitive data in the device's secure keychain
   */
  public async setSecureItem(
    key: string,
    value: string,
    options?: SecureStorageOptions
  ): Promise<boolean> {
    try {
      const keychainOptions: Keychain.Options = {
        service: options?.service || this.defaultService,
        accessControl:
          options?.accessControl || Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
        authenticationType:
          options?.authenticationType || Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
        ...(options?.accessGroup && { accessGroup: options.accessGroup }),
      };

      await Keychain.setInternetCredentials(key, key, value, keychainOptions);
      return true;
    } catch (error) {
      console.error('Error storing secure item:', error);
      return false;
    }
  }

  /**
   * Retrieve sensitive data from the device's secure keychain
   */
  public async getSecureItem(key: string, options?: SecureStorageOptions): Promise<string | null> {
    try {
      const keychainOptions: Keychain.Options = {
        service: options?.service || this.defaultService,
        authenticationType:
          options?.authenticationType || Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
        ...(options?.accessGroup && { accessGroup: options.accessGroup }),
      };

      const credentials = await Keychain.getInternetCredentials(key, keychainOptions);

      if (credentials && credentials.password) {
        return credentials.password;
      }

      return null;
    } catch (error) {
      console.error('Error retrieving secure item:', error);
      return null;
    }
  }

  /**
   * Remove sensitive data from the device's secure keychain
   */
  public async removeSecureItem(key: string, options?: SecureStorageOptions): Promise<boolean> {
    try {
      const keychainOptions: Keychain.Options = {
        service: options?.service || this.defaultService,
        ...(options?.accessGroup && { accessGroup: options.accessGroup }),
      };

      await Keychain.resetInternetCredentials(key, keychainOptions);
      return true;
    } catch (error) {
      console.error('Error removing secure item:', error);
      return false;
    }
  }

  /**
   * Store authentication tokens securely
   */
  public async storeAuthTokens(accessToken: string, refreshToken: string): Promise<boolean> {
    try {
      const success1 = await this.setSecureItem('access_token', accessToken);
      const success2 = await this.setSecureItem('refresh_token', refreshToken);
      return success1 && success2;
    } catch (error) {
      console.error('Error storing auth tokens:', error);
      return false;
    }
  }

  /**
   * Retrieve authentication tokens securely
   */
  public async getAuthTokens(): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
  }> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.getSecureItem('access_token'),
        this.getSecureItem('refresh_token'),
      ]);

      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Error retrieving auth tokens:', error);
      return { accessToken: null, refreshToken: null };
    }
  }

  /**
   * Clear all authentication tokens
   */
  public async clearAuthTokens(): Promise<boolean> {
    try {
      const success1 = await this.removeSecureItem('access_token');
      const success2 = await this.removeSecureItem('refresh_token');
      return success1 && success2;
    } catch (error) {
      console.error('Error clearing auth tokens:', error);
      return false;
    }
  }

  /**
   * Store biometric authentication data
   */
  public async storeBiometricData(userId: string, biometricHash: string): Promise<boolean> {
    try {
      const biometricData = JSON.stringify({
        userId,
        biometricHash,
        timestamp: Date.now(),
      });

      return await this.setSecureItem('biometric_data', biometricData, {
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
      });
    } catch (error) {
      console.error('Error storing biometric data:', error);
      return false;
    }
  }

  /**
   * Retrieve biometric authentication data
   */
  public async getBiometricData(): Promise<{
    userId: string;
    biometricHash: string;
    timestamp: number;
  } | null> {
    try {
      const data = await this.getSecureItem('biometric_data', {
        authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
      });

      if (data) {
        return JSON.parse(data);
      }

      return null;
    } catch (error) {
      console.error('Error retrieving biometric data:', error);
      return null;
    }
  }

  /**
   * Clear biometric authentication data
   */
  public async clearBiometricData(): Promise<boolean> {
    try {
      return await this.removeSecureItem('biometric_data');
    } catch (error) {
      console.error('Error clearing biometric data:', error);
      return false;
    }
  }

  /**
   * Store sensitive user data (encrypted)
   */
  public async storeUserData(key: string, data: any): Promise<boolean> {
    try {
      const jsonData = JSON.stringify(data);
      return await this.setSecureItem(`user_data_${key}`, jsonData);
    } catch (error) {
      console.error('Error storing user data:', error);
      return false;
    }
  }

  /**
   * Retrieve sensitive user data (decrypted)
   */
  public async getUserData(key: string): Promise<any | null> {
    try {
      const data = await this.getSecureItem(`user_data_${key}`);

      if (data) {
        return JSON.parse(data);
      }

      return null;
    } catch (error) {
      console.error('Error retrieving user data:', error);
      return null;
    }
  }

  /**
   * Clear all secure storage
   */
  public async clearAllSecureData(): Promise<boolean> {
    try {
      await Keychain.resetInternetCredentials(this.defaultService);
      return true;
    } catch (error) {
      console.error('Error clearing all secure data:', error);
      return false;
    }
  }

  /**
   * Check if keychain is available
   */
  public async isKeychainAvailable(): Promise<boolean> {
    try {
      const result = await Keychain.getSupportedBiometryType();
      return result !== null;
    } catch (error) {
      console.error('Error checking keychain availability:', error);
      return false;
    }
  }

  /**
   * Get supported biometry type
   */
  public async getSupportedBiometryType(): Promise<Keychain.BIOMETRY_TYPE | null> {
    try {
      return await Keychain.getSupportedBiometryType();
    } catch (error) {
      console.error('Error getting supported biometry type:', error);
      return null;
    }
  }

  /**
   * Store data in regular AsyncStorage (non-sensitive data)
   */
  public async setItem(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error('Error storing item:', error);
      return false;
    }
  }

  /**
   * Retrieve data from regular AsyncStorage
   */
  public async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Error retrieving item:', error);
      return null;
    }
  }

  /**
   * Remove data from regular AsyncStorage
   */
  public async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error removing item:', error);
      return false;
    }
  }
}

export default SecureStorageService;

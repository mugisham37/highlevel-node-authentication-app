import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import { BiometricAuthScreenProps } from '../../types/navigation';

const rnBiometrics = new ReactNativeBiometrics();

const BiometricAuthScreen: React.FC<BiometricAuthScreenProps> = ({ navigation }) => {
  const [biometryType, setBiometryType] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const { available, biometryType: type } = await rnBiometrics.isSensorAvailable();
      setIsAvailable(available);
      setBiometryType(type || null);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setIsAvailable(false);
    }
  };

  const handleBiometricAuth = async () => {
    if (!isAvailable) {
      Alert.alert(
        'Biometric Authentication Unavailable',
        'Biometric authentication is not available on this device.',
        [
          {
            text: 'Use Password',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }

    setIsLoading(true);

    try {
      const { success, error } = await rnBiometrics.simplePrompt({
        promptMessage: 'Authenticate to access your account',
        cancelButtonText: 'Cancel',
      });

      if (success) {
        // TODO: Implement actual biometric authentication logic with tRPC client
        // This will be connected to the API in a later integration task
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call

        Alert.alert('Success', 'Biometric authentication successful!', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Dashboard'),
          },
        ]);
      } else {
        Alert.alert(
          'Authentication Failed',
          error || 'Biometric authentication was cancelled or failed.'
        );
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      Alert.alert('Error', 'An error occurred during biometric authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsePassword = () => {
    navigation.navigate('Login');
  };

  const getBiometricIcon = () => {
    switch (biometryType) {
      case BiometryTypes.FaceID:
        return '👤';
      case BiometryTypes.TouchID:
      case BiometryTypes.Biometrics:
        return '👆';
      default:
        return '🔐';
    }
  };

  const getBiometricTitle = () => {
    switch (biometryType) {
      case BiometryTypes.FaceID:
        return 'Face ID';
      case BiometryTypes.TouchID:
        return 'Touch ID';
      case BiometryTypes.Biometrics:
        return 'Biometric Authentication';
      default:
        return 'Biometric Authentication';
    }
  };

  const getBiometricDescription = () => {
    if (!isAvailable) {
      return 'Biometric authentication is not available on this device. Please use your password to sign in.';
    }

    switch (biometryType) {
      case BiometryTypes.FaceID:
        return 'Use Face ID to quickly and securely access your account.';
      case BiometryTypes.TouchID:
        return 'Use Touch ID to quickly and securely access your account.';
      case BiometryTypes.Biometrics:
        return 'Use biometric authentication to quickly and securely access your account.';
      default:
        return 'Use biometric authentication to access your account.';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#6366f1" />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{getBiometricIcon()}</Text>
          </View>
          <Text style={styles.title}>{getBiometricTitle()}</Text>
          <Text style={styles.subtitle}>{getBiometricDescription()}</Text>
        </View>

        <View style={styles.buttonContainer}>
          {isAvailable ? (
            <TouchableOpacity
              style={[styles.biometricButton, isLoading && styles.biometricButtonDisabled]}
              onPress={handleBiometricAuth}
              disabled={isLoading}
            >
              <Text style={styles.biometricButtonText}>
                {isLoading ? 'Authenticating...' : `Use ${getBiometricTitle()}`}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.passwordButton} onPress={handleUsePassword}>
            <Text style={styles.passwordButtonText}>Use Password Instead</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Your biometric data is stored securely on your device and is never shared.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 64,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#6366f1',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  buttonContainer: {
    gap: 16,
  },
  biometricButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  biometricButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  biometricButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  passwordButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  passwordButtonText: {
    color: '#6366f1',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default BiometricAuthScreen;

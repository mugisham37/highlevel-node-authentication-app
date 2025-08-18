import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor, store } from './store';

// Import screens
import TabNavigator from './navigation/TabNavigator';
import HomeScreen from './screens/HomeScreen';
import BiometricAuthScreen from './screens/auth/BiometricAuthScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';
import LoginScreen from './screens/auth/LoginScreen';
import RegisterScreen from './screens/auth/RegisterScreen';
import TwoFactorAuthScreen from './screens/auth/TwoFactorAuthScreen';

// Import navigation types
import { RootStackParamList } from './types/navigation';

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <GestureHandlerRootView style={styles.container}>
          <SafeAreaProvider>
            <NavigationContainer>
              <Stack.Navigator
                initialRouteName="Home"
                screenOptions={{
                  headerStyle: {
                    backgroundColor: '#6366f1',
                  },
                  headerTintColor: '#fff',
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                }}
              >
                <Stack.Screen
                  name="Home"
                  component={HomeScreen}
                  options={{ title: 'Company Mobile' }}
                />
                <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
                <Stack.Screen
                  name="Register"
                  component={RegisterScreen}
                  options={{ title: 'Create Account' }}
                />
                <Stack.Screen
                  name="ForgotPassword"
                  component={ForgotPasswordScreen}
                  options={{ title: 'Reset Password' }}
                />
                <Stack.Screen
                  name="TwoFactorAuth"
                  component={TwoFactorAuthScreen}
                  options={{ title: 'Two-Factor Authentication' }}
                />
                <Stack.Screen
                  name="BiometricAuth"
                  component={BiometricAuthScreen}
                  options={{ title: 'Biometric Authentication' }}
                />
                <Stack.Screen
                  name="MainTabs"
                  component={TabNavigator}
                  options={{ headerShown: false }}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PersistGate>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;

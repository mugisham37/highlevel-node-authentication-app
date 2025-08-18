import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

// Define the parameter list for the root stack navigator
export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  TwoFactorAuth: { userId: string; method: 'sms' | 'email' | 'totp' };
  BiometricAuth: undefined;
  Dashboard: undefined;
  MainTabs: undefined;
  Profile: undefined;
  Settings: undefined;
  Security: undefined;
  Sessions: undefined;
};

// Navigation prop types for each screen
export type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

export type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export type RegisterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Register'>;

export type ForgotPasswordScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'ForgotPassword'
>;

export type TwoFactorAuthScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'TwoFactorAuth'
>;

export type BiometricAuthScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'BiometricAuth'
>;

export type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboard'>;

export type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'>;

export type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export type SecurityScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Security'>;

export type SessionsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Sessions'>;

// Route prop types for screens that receive parameters
export type TwoFactorAuthScreenRouteProp = RouteProp<RootStackParamList, 'TwoFactorAuth'>;

// Combined navigation and route props for screens
export type HomeScreenProps = {
  navigation: HomeScreenNavigationProp;
};

export type LoginScreenProps = {
  navigation: LoginScreenNavigationProp;
};

export type RegisterScreenProps = {
  navigation: RegisterScreenNavigationProp;
};

export type ForgotPasswordScreenProps = {
  navigation: ForgotPasswordScreenNavigationProp;
};

export type TwoFactorAuthScreenProps = {
  navigation: TwoFactorAuthScreenNavigationProp;
  route: TwoFactorAuthScreenRouteProp;
};

export type BiometricAuthScreenProps = {
  navigation: BiometricAuthScreenNavigationProp;
};

export type DashboardScreenProps = {
  navigation: DashboardScreenNavigationProp;
};

export type ProfileScreenProps = {
  navigation: ProfileScreenNavigationProp;
};

export type SettingsScreenProps = {
  navigation: SettingsScreenNavigationProp;
};

export type SecurityScreenProps = {
  navigation: SecurityScreenNavigationProp;
};

export type SessionsScreenProps = {
  navigation: SessionsScreenNavigationProp;
};

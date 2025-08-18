# Company Mobile App

React Native mobile application for the fullstack monolith authentication
system.

## Features

- React Native with TypeScript
- React Navigation for routing
- Monorepo support with Metro bundler
- iOS and Android build configurations
- Shared packages integration
- Biometric authentication support (planned)
- Offline synchronization (planned)
- Push notifications (planned)

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- React Native CLI
- Xcode (for iOS development)
- Android Studio (for Android development)
- Java Development Kit (JDK) 11 or newer

### Installation

1. Install dependencies from the monorepo root:

   ```bash
   pnpm install
   ```

2. For iOS development, install CocoaPods dependencies:

   ```bash
   cd apps/mobile/ios
   pod install
   ```

3. For Android development, ensure you have the Android SDK installed and
   configured.

### Running the App

#### iOS

```bash
# From the mobile app directory
cd apps/mobile
npm run ios

# Or from the monorepo root
pnpm --filter @company/mobile ios
```

#### Android

```bash
# From the mobile app directory
cd apps/mobile
npm run android

# Or from the monorepo root
pnpm --filter @company/mobile android
```

#### Metro Bundler

```bash
# Start the Metro bundler
cd apps/mobile
npm run start

# Or from the monorepo root
pnpm --filter @company/mobile start
```

## Project Structure

```
apps/mobile/
├── src/
│   ├── screens/           # Screen components
│   │   ├── auth/         # Authentication screens
│   │   └── HomeScreen.tsx
│   ├── types/            # TypeScript type definitions
│   │   └── navigation.ts # Navigation types
│   ├── __tests__/        # Test files
│   └── App.tsx           # Main app component
├── android/              # Android-specific files
├── ios/                  # iOS-specific files
├── index.js              # Entry point
├── app.json              # App configuration
├── metro.config.js       # Metro bundler configuration
├── babel.config.js       # Babel configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## Available Scripts

- `npm run start` - Start the Metro bundler
- `npm run ios` - Run on iOS simulator
- `npm run android` - Run on Android emulator
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Shared Packages

This mobile app uses the following shared packages from the monorepo:

- `@company/shared` - Shared domain entities, types, and utilities
- `@company/api-contracts` - tRPC API contracts for type-safe communication

## Next Steps

The following features will be implemented in subsequent tasks:

1. **Authentication Screens** (Task 7.2)
   - Login and registration forms
   - Biometric authentication
   - Two-factor authentication
   - Password reset flow

2. **Mobile-Specific Features** (Task 7.3)
   - Offline synchronization with AsyncStorage
   - Push notifications integration
   - Device fingerprinting
   - Secure storage for sensitive data
   - Tab and stack navigation

## Testing

Run tests with:

```bash
npm run test
```

The app includes Jest configuration with React Native testing utilities and
mocks for common React Native modules.

## Build Configuration

### iOS

- Minimum iOS version: 12.0
- Supports iPhone and iPad
- Includes permissions for camera, microphone, Face ID, and location

### Android

- Minimum SDK version: 21 (Android 5.0)
- Target SDK version: 34 (Android 14)
- Includes permissions for camera, microphone, biometric, and location

## Troubleshooting

### Metro Bundler Issues

If you encounter Metro bundler issues with monorepo packages:

1. Clear Metro cache: `npx react-native start --reset-cache`
2. Clean and rebuild: `npm run clean && npm run start`

### iOS Build Issues

1. Clean Xcode build folder: Product → Clean Build Folder
2. Reinstall CocoaPods: `cd ios && pod deintegrate && pod install`

### Android Build Issues

1. Clean Gradle cache: `cd android && ./gradlew clean`
2. Ensure Android SDK and build tools are properly installed

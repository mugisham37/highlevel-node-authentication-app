/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'tests/mobile/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/FullstackMonolith.app',
      build:
        'cd apps/mobile && xcodebuild -workspace ios/FullstackMonolith.xcworkspace -scheme FullstackMonolith -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath:
        'apps/mobile/ios/build/Build/Products/Release-iphonesimulator/FullstackMonolith.app',
      build:
        'cd apps/mobile && xcodebuild -workspace ios/FullstackMonolith.xcworkspace -scheme FullstackMonolith -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd apps/mobile && ./android/gradlew assembleDebug -p android',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd apps/mobile && ./android/gradlew assembleRelease -p android',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 14',
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_3a_API_30_x86',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug',
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },
};

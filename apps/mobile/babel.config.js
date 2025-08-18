module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@company/shared': '../../packages/shared/src',
          '@company/api-contracts': '../../packages/api-contracts/src',
        },
      },
    ],
    'react-native-reanimated/plugin', // Must be last
  ],
};

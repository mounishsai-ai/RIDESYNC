import { ExpoConfig, ConfigContext } from 'expo/config';

// Reads environment variables at build time via Expo's config system.
// Set these in a .env file in the apps/driver directory.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RideSync Driver',
  slug: 'developerx',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      projectId: 'c6748712-4447-4637-b003-84dee7d88b3b',
    },
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.ridesync.driver',
    infoPlist: {
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'RideSync needs your location to transmit your bus position to students in real-time, even when the app is in the background.',
      NSLocationWhenInUseUsageDescription:
        'RideSync needs your location to show your current position on the map.',
      NSLocationAlwaysUsageDescription:
        'RideSync needs background location access so students can track the bus even when this app is minimized.',
      UIBackgroundModes: ['location', 'fetch'],
    },
  },
  android: {
    package: 'com.ridesync.driver',
    adaptiveIcon: {
      backgroundColor: '#0F172A',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'RideSync needs your location to transmit your bus position to students, even when the app is in the background.',
        locationAlwaysPermission:
          'RideSync needs background location access so students can track the bus even when this app is minimized.',
        locationWhenInUsePermission:
          'RideSync needs your location to show your current position.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
});

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.optionstracker.app',
  appName: 'Options Tracker',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'http',
    // Allow clear text traffic for development
    cleartext: true,
    // Configure for local development
    url: 'http://10.0.2.2:5000', // Android emulator localhost mapping
    hostname: '10.0.2.2',
    iosScheme: 'http'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: true,
      spinnerColor: '#3b82f6',
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
      overlay: false
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#3b82f6',
      sound: 'default'
    },
    App: {
      backButtonExit: false
    },
    Haptics: {
      enabled: true
    }
  }
};

export default config;

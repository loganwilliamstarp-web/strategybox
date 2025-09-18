import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface CapacitorState {
  isNative: boolean;
  platform: string;
}

export function useCapacitor() {
  const [state, setState] = useState<CapacitorState>(() => {
    // Safe initialization for SSR compatibility
    try {
      return {
        isNative: Capacitor.isNativePlatform(),
        platform: Capacitor.getPlatform()
      };
    } catch {
      return {
        isNative: false,
        platform: 'web'
      };
    }
  });

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Setup native features
      setupNativeApp();
    }
  }, []);

  const setupNativeApp = async () => {
    try {
      // Configure status bar
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#1e293b' });

      // Hide splash screen after app loads
      await SplashScreen.hide();

      // Handle app state changes
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        console.log('App state changed. Is active?', isActive);
      });

    } catch (error) {
      console.warn('Native setup failed:', error);
    }
  };

  const triggerHaptics = async (style: ImpactStyle = ImpactStyle.Medium) => {
    if (state.isNative) {
      try {
        await Haptics.impact({ style });
      } catch (error) {
        console.warn('Haptics not available:', error);
      }
    }
  };

  return {
    ...state,
    triggerHaptics
  };
}
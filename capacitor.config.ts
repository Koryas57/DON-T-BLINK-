import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dontblink.app',
  appName: "DON'T BLINK",
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

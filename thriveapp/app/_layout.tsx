import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Analytics } from '@vercel/analytics/react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '../context/auth';
import { SeasonProvider } from '../context/season';
import { Colors } from '@/constants/theme';
import ErrorBoundary from '../components/ErrorBoundary';
import { setupGlobalErrorHandling } from '../services/errorService';

// Initialize global error tracking for non-rendering errors
setupGlobalErrorHandling();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const CustomDefaultTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Colors.light.background,
      card: Colors.light.card,
      text: Colors.light.text,
      border: Colors.light.border,
      primary: Colors.light.tint,
    },
  };

  const CustomDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: Colors.dark.background,
      card: Colors.dark.card,
      text: Colors.dark.text,
      border: Colors.dark.border,
      primary: Colors.dark.tint,
    },
  };

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : CustomDefaultTheme}>
        <SeasonProvider>
          <AuthProvider>
            <Head>
              <title>Thrive Collective</title>
              <meta name="description" content="Thrive Collective Gym Booking App" />
            </Head>
            <Stack screenOptions={{ title: 'Thrive Collective' }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Settings' }} />
              {/* Analytics draws its own header, so the stack's one would be a second, duplicate bar */}
              <Stack.Screen name="analytics" options={{ headerShown: false }} />
              <Stack.Screen name="week" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style="auto" />
            <Analytics />
          </AuthProvider>
        </SeasonProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

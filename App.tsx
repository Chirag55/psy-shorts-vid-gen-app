import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, StatusBar, View } from 'react-native';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '@/theme';
import Navigation from '@/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useStudio } from '@/store';
import { workspaceRoot } from '@/services/workspace';
import { clearTrail } from '@/services/breadcrumbs';
import { diagnosePreviousRun } from '@/services/diagnostics';
import * as Clipboard from 'expo-clipboard';

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function App() {
  const hydrated = useStudio((s) => s.hydrated);

  useEffect(() => {
    // Create the workspace tree up front so every later write can assume it exists.
    try {
      workspaceRoot();
    } catch {
      // Non-fatal: individual writes create their own intermediates.
    }

    // A native crash kills the process outright, so nothing in memory survives
    // to report it. Three things are reconstructed on the next launch: the
    // breadcrumb trail (what the app was doing), Android's own exit record (how
    // the process actually ended — a segfault and a low-memory kill are
    // indistinguishable from inside the app and need opposite fixes), and the
    // build version, so there is never again any doubt about which build was
    // running when it happened.
    void (async () => {
      try {
        const diagnosis = await diagnosePreviousRun();
        if (!diagnosis) return;

        Alert.alert('Last session ended unexpectedly', diagnosis.summary, [
          {
            text: 'Copy details',
            onPress: () => {
              void Clipboard.setStringAsync(diagnosis.report);
            },
          },
          { text: 'Dismiss', style: 'cancel', onPress: () => clearTrail() },
        ]);
      } catch {
        // Diagnostics must never block startup.
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
        {hydrated ? (
          <ErrorBoundary>
            <NavigationContainer theme={theme}>
              <Navigation />
            </NavigationContainer>
          </ErrorBoundary>
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

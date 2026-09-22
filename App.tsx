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
import { clearTrail, describeCrash, findPreviousCrash } from '@/services/breadcrumbs';

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
    // to report it. The breadcrumb trail is written to disk before each risky
    // step; an unfinished tail on startup is where the app died last time.
    try {
      const crash = findPreviousCrash();
      if (crash) {
        Alert.alert('Last session ended unexpectedly', describeCrash(crash), [
          { text: 'Dismiss', onPress: () => clearTrail() },
        ]);
      }
    } catch {
      // Diagnostics must never block startup.
    }
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

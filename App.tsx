import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, AppState, StatusBar, View } from 'react-native';
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
import { clearJavaCrash } from '@/services/crashInfo';
import * as Clipboard from 'expo-clipboard';
import { registerBackgroundChecks } from '@/services/backgroundChecks';
import { runReleaseChecks } from '@/services/releaseWatch';
import { runFunnelUpdates } from '@/services/funnelUpdates';
import { refreshYppIfStale } from '@/services/ypp';
import { runWeeklyReviewIfDue } from '@/services/weeklyReview';
import { runAutoImport, showAutoImportNotice } from '@/services/autoImportBank';

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
  const loadProblem = useStudio((s) => s.loadProblem);

  // Projects that could not be read are kept on disk; say so instead of showing an empty studio.
  useEffect(() => {
    if (loadProblem) Alert.alert('Saved projects not loaded', loadProblem);
  }, [loadProblem]);

  // A newer bundled topic bank imports itself once the store is ready.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (runAutoImport()) showAutoImportNotice();
    } catch (e) {
      Alert.alert('Topic bank not imported', e instanceof Error ? e.message : String(e));
    }
  }, [hydrated]);

  // Release checks, funnel links, YPP numbers and the weekly review: on launch and on every return.
  useEffect(() => {
    if (!hydrated) return;
    void registerBackgroundChecks();
    const check = () => {
      runReleaseChecks()
        .catch(() => undefined)
        .then(() => runFunnelUpdates())
        .catch(() => undefined)
        .then(() => refreshYppIfStale())
        .then(() => runWeeklyReviewIfDue())
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [hydrated]);

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
          {
            text: 'Dismiss',
            style: 'cancel',
            onPress: () => {
              clearTrail();
              void clearJavaCrash();
            },
          },
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

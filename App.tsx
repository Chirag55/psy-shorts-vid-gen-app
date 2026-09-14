import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '@/theme';
import Navigation from '@/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useStudio } from '@/store';
import { workspaceRoot } from '@/services/workspace';

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

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/theme';
import { Button } from './ui';

/**
 * Catches render errors so a bug in one screen shows a recoverable message
 * instead of a blank white screen with no way back.
 *
 * The error text is shown on-device only. Nothing is reported anywhere — this
 * app has no telemetry, and a crash trace can contain project content.
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Console only. Useful when attached to Metro, invisible otherwise.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.root}>
        <Text style={s.title}>Something broke</Text>
        <Text style={s.body}>
          The screen hit an error. Your projects and files are untouched — they are saved on this device,
          not in the screen that failed.
        </Text>
        <ScrollView style={s.traceBox}>
          <Text style={s.trace}>
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </Text>
        </ScrollView>
        <Button label="Try again" onPress={this.reset} />
      </View>
    );
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.md, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  traceBox: {
    maxHeight: 260,
    backgroundColor: '#05070b',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  trace: { color: colors.textFaint, fontSize: 11, fontFamily: 'monospace', lineHeight: 15 },
});

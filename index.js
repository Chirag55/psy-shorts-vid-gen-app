import { registerRootComponent } from 'expo';

/**
 * Startup is wrapped so a failure while the JS bundle is being evaluated shows
 * a readable screen instead of the app simply refusing to open.
 *
 * React error boundaries cannot help here: they only catch errors thrown while
 * rendering an already-mounted tree. An exception raised as a module is
 * imported — a native module missing from the build, say — happens before React
 * exists, and a release build has no red box, so the app just closes with
 * nothing to go on.
 */
function renderStartupError(error) {
  // Required lazily and kept dependency-free: whatever broke may be the very
  // thing a richer fallback would rely on.
  const React = require('react');
  const { ScrollView, Text, View } = require('react-native');

  const message = error && error.message ? error.message : String(error);
  const stack = error && error.stack ? String(error.stack) : '';

  const style = {
    root: { flex: 1, backgroundColor: '#0b0e14', padding: 24, paddingTop: 72, gap: 12 },
    title: { color: '#e8ecf4', fontSize: 20, fontWeight: '800' },
    body: { color: '#94a1b8', fontSize: 14, lineHeight: 20 },
    box: { flex: 1, backgroundColor: '#05070b', borderRadius: 6, padding: 10, marginTop: 8 },
    trace: { color: '#f87171', fontSize: 11, fontFamily: 'monospace', lineHeight: 15 },
  };

  function StartupError() {
    return React.createElement(
      View,
      { style: style.root },
      React.createElement(Text, { style: style.title }, 'The Mind Files Studio could not start'),
      React.createElement(
        Text,
        { style: style.body },
        'Something failed while the app was loading. The details below say what — send them on and it can be fixed.'
      ),
      React.createElement(
        ScrollView,
        { style: style.box },
        React.createElement(Text, { style: style.trace }, stack ? `${message}\n\n${stack}` : message)
      )
    );
  }

  registerRootComponent(StartupError);
}

try {
  const App = require('./App').default;
  registerRootComponent(App);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Startup failure', error);
  renderStartupError(error);
}

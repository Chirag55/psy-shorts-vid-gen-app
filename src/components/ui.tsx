import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, type as typo } from '@/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={s.screen}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={typo.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={typo.h2}>{children}</Text>;
}
export function H3({ children }: { children: React.ReactNode }) {
  return <Text style={typo.h3}>{children}</Text>;
}
export function Body({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[typo.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
export function Small({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[typo.small, style]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        s.btn,
        variantStyle[variant],
        pressed && !inactive && s.btnPressed,
        inactive && s.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#1a1206' : colors.text} size="small" />
      ) : (
        <Text style={[s.btnLabel, variant === 'primary' && s.btnLabelPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const variantStyle: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderColor: colors.danger },
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize = 'sentences',
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'characters';
  secure?: boolean;
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={!secure}
        secureTextEntry={secure}
      />
    </View>
  );
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const toneColor = {
    ok: colors.ok,
    warn: colors.warn,
    danger: colors.danger,
    info: colors.info,
    neutral: colors.textFaint,
  }[tone];

  return (
    <View style={[s.badge, { borderColor: toneColor }]}>
      <Text style={[s.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={s.divider} />;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  btnPressed: { opacity: 0.75 },
  btnDisabled: { opacity: 0.4 },
  btnLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  btnLabelPrimary: { color: '#1a1206' },
  fieldLabel: { color: colors.textDim, fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  empty: { padding: space.xl, alignItems: 'center', gap: space.sm },
  emptyTitle: { color: colors.textDim, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { color: colors.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: '#1a1206' },
});

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, space } from '@/theme';
import { hasStyleLock } from '@/core/styleLock';
import { Badge, Body, Row, Small } from './ui';

/**
 * One Veo / Imagen prompt with a one-tap copy action.
 *
 * Copying is the core mobile interaction: Google Flow has no API, so the phone's
 * job is to hand a correct, style-locked prompt to the Flow web app in one tap.
 */
export function PromptCard({
  label,
  prompt,
  status,
  onImport,
  onGenerate,
  generating,
}: {
  label: string;
  prompt: string;
  status?: { label: string; tone: 'ok' | 'warn' | 'neutral' };
  onImport?: () => void;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={s.wrap}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={s.label}>{label}</Text>
        <Row>
          {!hasStyleLock(prompt) ? <Badge label="NO STYLE LOCK" tone="danger" /> : null}
          {status ? <Badge label={status.label} tone={status.tone} /> : null}
        </Row>
      </Row>

      <Pressable onPress={() => setExpanded((e) => !e)}>
        <Body style={s.prompt} numberOfLines={expanded ? undefined : 3}>
          {prompt}
        </Body>
        <Small style={s.toggle}>{expanded ? 'Tap to collapse' : 'Tap to expand'}</Small>
      </Pressable>

      <Row style={{ marginTop: space.xs, flexWrap: 'wrap' }}>
        <Pressable onPress={copy} style={[s.action, copied && s.actionDone]}>
          <Text style={[s.actionText, copied && s.actionTextDone]}>
            {copied ? '✓ Copied for Flow' : '📋 Copy to Flow'}
          </Text>
        </Pressable>
        {onImport ? (
          <Pressable onPress={onImport} style={s.action}>
            <Text style={s.actionText}>⬆ Import result</Text>
          </Pressable>
        ) : null}
        {onGenerate ? (
          <Pressable onPress={onGenerate} disabled={generating} style={[s.action, generating && s.actionBusy]}>
            <Text style={s.actionText}>{generating ? '… Generating' : '✨ Generate'}</Text>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  label: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  prompt: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  toggle: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
  action: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionDone: { borderColor: colors.ok },
  actionBusy: { opacity: 0.5 },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  actionTextDone: { color: colors.ok },
});

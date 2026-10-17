import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Button, Card, Field, H3, Row, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { bestSnapshot, retentionDrop, snapshotDue } from '@/core/retention';
import { takeDueSnapshots } from '@/services/retention';
import type { Project } from '@/core/types';
import { useMounted } from '@/util/useMounted';

const pct = (n: number) => `${Math.round(n)}%`;

/** The 72-hour and 7-day retention readings of a published video, and where viewers left. */
export function RetentionCard({ project }: { project: Project }) {
  const analytics = useStudio((s) => s.analytics);
  const setViewedPercent = useStudio((s) => s.setViewedPercent);
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  const [viewed, setViewed] = useState('');

  const snapshots = project.virality?.snapshots;
  const best = bestSnapshot(snapshots);
  const videoId = project.assets.youtubeVideoId;
  const due = project.assets.publishedAt ? snapshotDue(project.assets.publishedAt, snapshots, new Date()) : null;

  const drop = useMemo(() => {
    if (!best?.curve) return null;
    const duration =
      (videoId && analytics[videoId]?.durationSeconds) ||
      (best.averageViewPercentage > 0 ? best.averageViewDuration / (best.averageViewPercentage / 100) : 0);
    const alignment = (project.assets as any).alignment ?? {};
    const words = alignment[project.mode === 'short' ? 'short' : '1'] ?? [];
    return retentionDrop(best.curve, duration, project.mode === 'short' ? words : []);
  }, [best, analytics, videoId, project]);

  if (!videoId) return null;

  const take = async () => {
    setBusy(true);
    try {
      const r = await takeDueSnapshots(new Date(), project);
      Alert.alert(
        r.taken ? 'Snapshot saved' : 'Nothing due yet',
        r.errors[0] ??
          (r.taken
            ? "Kept beside this video's audit."
            : 'The first reading is taken 72 hours after it goes public, the second at 7 days.'),
      );
    } catch (e) {
      Alert.alert('Could not read', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>Retention</H3>
        {project.virality?.audit ? <Badge label={`AUDIT ${project.virality.audit.score}`} tone="info" /> : null}
      </Row>
      {(['h48', 'd7'] as const).map((key) => {
        const s = snapshots?.[key];
        return (
          <Small key={key} style={{ color: s ? colors.text : colors.textFaint }}>
            {key === 'h48' ? '72 hours' : '7 days'}:{' '}
            {s
              ? `${pct(s.averageViewPercentage)} viewed on average, ${Math.round(s.averageViewDuration)} s, ${s.views.toLocaleString()} views` +
                (s.viewedPercent !== undefined ? `, ${pct(s.viewedPercent)} viewed (not swiped away)` : '') +
                (s.engagedViews !== undefined && s.views > 0 ? `, ${pct((s.engagedViews / s.views) * 100)} engaged views` : '') +
                (s.likes !== undefined ? `, ${s.likes} likes` : '') +
                (s.comments !== undefined ? `, ${s.comments} comments` : '') +
                (s.subscribersGained !== undefined ? `, +${s.subscribersGained} subscribers` : '')
              : 'no data yet'}
          </Small>
        );
      })}
      {drop ? (
        <Small style={{ color: colors.warn }}>
          {drop.text} ({drop.points} points of the audience.)
        </Small>
      ) : null}
      {project.virality?.variant ? <Small>Variant: {project.virality.variant}</Small> : null}
      <Row style={{ gap: space.xs, flexWrap: 'wrap' }}>
        <Button
          label={
            busy ? 'Reading…' : due ? `Take the ${due === 'h48' ? '72-hour' : '7-day'} snapshot` : 'Refresh snapshots'
          }
          variant="secondary"
          loading={busy}
          onPress={() => void take()}
        />
      </Row>
      <Field
        label="Viewed vs swiped away (%) from YouTube Studio"
        value={viewed}
        onChangeText={setViewed}
        keyboardType="numeric"
      />
      <Button
        label="Save"
        variant="ghost"
        disabled={!viewed.trim() || !Number.isFinite(Number(viewed))}
        onPress={() => {
          setViewedPercent(project.id, Math.max(0, Math.min(100, Number(viewed))));
          setViewed('');
        }}
      />
    </Card>
  );
}

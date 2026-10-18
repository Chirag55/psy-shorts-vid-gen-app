import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Button, Card, H3, ProgressBar, Row, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { costLine, remaining, stillJobs } from '@/core/stillQueue';
import { exportStillPrompts, isQueueRunning, startStillQueue, stopStillQueue } from '@/services/stillQueue';

/** Makes a long video's stills in the app, paced under the image key's rate limit. */
export default function StillQueueCard({ projectId }: { projectId: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const queue = useStudio((s) => s.stillQueues[projectId]);
  const imageModel = useStudio((s) => s.settings.imageModel);
  const [starting, setStarting] = useState(false);

  const visuals = useMemo(
    () =>
      project?.script.mode !== 'long' ? [] : (project.script as any).chapters.flatMap((c: any) => c.visuals ?? []),
    [project],
  );
  const jobs = useMemo(
    () => stillJobs(visuals, (project?.assets as any)?.stills ?? {}),
    [visuals, (project?.assets as any)?.stills],
  );

  if (!project || project.script.mode !== 'long' || !visuals.some((v: any) => v.kind === 'still')) return null;

  const running = starting || isQueueRunning(projectId);
  const toMake = queue && queue.status !== 'done' && remaining(queue).length ? remaining(queue).length : jobs.length;
  const total = queue?.keys.length || jobs.length;
  const looksLikeImageModel = /image|imagen/i.test(imageModel);

  const start = async () => {
    if (running) return;
    setStarting(true);
    try {
      await startStillQueue(projectId);
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const confirmStart = () =>
    Alert.alert(
      `Make ${toMake} still${toMake === 1 ? '' : 's'}?`,
      `${costLine(toMake)} with ${imageModel}, one every few seconds. You can stop it and pick it up again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => void start() },
      ],
    );

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>Make the stills (CR-79)</H3>
        <Badge label={toMake ? `${toMake} TO MAKE` : 'ALL IN'} tone={toMake ? 'neutral' : 'ok'} />
      </Row>
      <Small>
        {costLine(toMake)} with {imageModel}. A still stands for several moments, each with its own zoom or pan, so this
        is the whole batch. It runs in the app, paced under the key's rate limit, tries a failed picture once more, and
        stops with the reason at a quota or a key problem. Cards are drawn by the app and never sent here.
      </Small>
      {looksLikeImageModel ? null : (
        <Small style={{ color: colors.warn }}>
          "{imageModel}" does not look like an image model. In Settings, load the image models and pick a Gemini one, or
          export the prompts below.
        </Small>
      )}
      {queue?.keys.length ? <ProgressBar fraction={total ? queue.done.length / total : 0} /> : null}
      {queue?.message ? (
        <Small style={{ color: queue.status === 'blocked' ? colors.danger : colors.text }}>{queue.message}</Small>
      ) : null}
      <Row style={{ gap: space.sm, marginTop: space.xs }}>
        {running ? (
          <Button label="Stop" variant="secondary" onPress={() => stopStillQueue(projectId)} />
        ) : toMake ? (
          <Button
            label={queue?.done.length ? `Resume (${toMake} left)` : `Start (${costLine(toMake)})`}
            onPress={confirmStart}
          />
        ) : null}
        <Button
          label="Export the prompts"
          variant="ghost"
          onPress={() => {
            exportStillPrompts(projectId).catch((e) =>
              Alert.alert('Export failed', e instanceof Error ? e.message : String(e)),
            );
          }}
        />
      </Row>
    </Card>
  );
}

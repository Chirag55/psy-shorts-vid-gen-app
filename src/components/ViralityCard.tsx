import React, { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Badge, Button, Card, H3, Row, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { isV2 } from '@/core/topicBank';
import { catchphraseOn, variantOf } from '@/core/viralityInput';
import { auditLongProject, auditShortProject } from '@/services/virality';
import { mark } from '@/services/breadcrumbs';
import type { ViralityReport } from '@/core/virality';
import type { Project } from '@/core/types';

const ICON = { pass: '✓', warn: '!', fail: '✗' } as const;
const STATUS_COLORS = { pass: colors.ok, warn: colors.warn, fail: colors.danger } as const;

/**
 * Scores a video on the factors that drive reach, from the rendered media.
 * Advisory only: a low score asks for confirmation at publish, never blocks.
 */
export function ViralityCard({
  project,
  durations,
  onAudit,
}: {
  project: Project;
  durations?: Record<string, number>;
  onAudit?: (report: ViralityReport) => void;
}) {
  const settings = useStudio((s) => s.settings);
  const channelConfig = useStudio((s) => s.channelConfig);
  const bank = useStudio((s) => s.bank);
  const updateProject = useStudio((s) => s.updateProject);
  const [report, setReport] = useState<ViralityReport | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  /** Shorts pointing at this long video, named by it or naming it. */
  const feederShorts = useMemo(() => {
    if (project.mode !== 'long') return 0;
    const id = (project as any).bankEntryId ?? (project.script as any).bankEntryId;
    const entry: any = bank.find((e: any) => e.id === id);
    const named: string[] = entry && isV2(entry) && entry.kind === 'long' ? (entry.feeder_shorts ?? []) : [];
    const pointing = bank
      .filter((e: any) => isV2(e) && e.kind === 'short' && e.related_longform === id)
      .map((e: any) => e.id as string);
    return new Set([...named, ...pointing]).size;
  }, [bank, project]);

  const key = JSON.stringify([
    project.script,
    project.assets.alignment,
    project.assets.finalVideo,
    (project as any).catchphraseOnShort,
    (project as any).hootEntry,
    settings.includeCaptions,
    settings.includeMascot,
    durations,
    feederShorts,
  ]);

  useEffect(() => {
    let alive = true;
    setError('');
    void (async () => {
      try {
        const r =
          project.mode === 'short'
            ? await auditShortProject(project, { settings, channelConfig })
            : await auditLongProject(project, { feederShorts, durations });
        if (!alive) return;
        setReport(r);
        onAudit?.(r);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        mark(`Virality audit failed: ${e instanceof Error ? e.message : String(e)}`)();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) {
    return (
      <Card>
        <H3>Virality audit</H3>
        <Small style={{ color: colors.warn }}>Could not run: {error}</Small>
      </Card>
    );
  }
  if (!report) {
    return (
      <Card>
        <H3>Virality audit</H3>
        <Small>Measuring the voice and the pictures…</Small>
      </Card>
    );
  }

  const tone = report.score >= 75 ? 'ok' : report.score >= 60 ? 'warn' : 'danger';
  const isShort = project.mode === 'short';
  const catchOn = isShort ? catchphraseOn(project) : false;
  const bankV2 = (project.script as any).bankV2;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>Virality audit</H3>
        <Badge label={`${report.score}/100`} tone={tone} />
      </Row>
      {report.gate === 'confirm' ? (
        <Small style={{ color: colors.danger }}>Below 60: publishing will ask you to confirm. It never blocks.</Small>
      ) : report.gate === 'warn' ? (
        <Small style={{ color: colors.warn }}>Below 75: worth fixing before this goes out.</Small>
      ) : (
        <Small style={{ color: colors.ok }}>75 or more: ready on the factors that drive reach.</Small>
      )}
      {report.topFixes.map((fix, i) => (
        <Small key={fix} style={{ color: colors.text }}>
          {i + 1}. {fix}
        </Small>
      ))}
      {isShort && bankV2 ? (
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small style={{ color: colors.text }}>
            Catchphrase test: {catchOn ? 'on' : 'off'} (variant: {variantOf(project)})
          </Small>
          <Button
            label={catchOn ? 'Turn off' : 'Turn on'}
            variant="ghost"
            onPress={() => updateProject(project.id, { catchphraseOnShort: !catchOn } as any)}
          />
        </Row>
      ) : null}
      <Pressable onPress={() => setExpanded((v) => !v)} style={{ paddingVertical: space.xs }}>
        <Small style={{ color: colors.accent }}>
          {expanded ? 'Hide' : 'Show'} all {report.checks.length} checks
        </Small>
      </Pressable>
      {expanded
        ? report.checks.map((c) => (
            <Small key={c.id} style={{ color: STATUS_COLORS[c.status] }}>
              {ICON[c.status]} {c.id} {c.label}
              {c.weight === 2 ? ' (×2)' : ''} — {c.detail}
            </Small>
          ))
        : null}
    </Card>
  );
}

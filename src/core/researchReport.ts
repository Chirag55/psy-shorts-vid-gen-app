/**
 * The Markdown report saved next to each outlier research run.
 */

const STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  complete: 'Complete',
  partial_quota: 'Partial — quota',
  cancelled: 'Cancelled — partial results',
  failed: 'Failed',
  interrupted: 'Interrupted',
};

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

const ratio = (x: number | null | undefined) =>
  x !== null && x !== undefined ? `${x >= 10 ? Math.round(x) : x.toFixed(1)}x` : '—';

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function durationLabel(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  return `${Math.round(seconds)}s`;
}

export function shortsLink(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`;
}

export function buildReportMarkdown(run: any): string {
  const day = run.startedAt.slice(0, 10);
  const minutes = run.finishedAt
    ? Math.max(1, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 60000))
    : 0;
  const q = run.quality;
  const lines: string[] = [
    `# Outlier Report — ${run.profileName} — ${day}${run.replayOf ? ' (re-scored)' : ''}`,
    `Build: app ${run.appVersion ?? 'unknown (before 3.9.0)'} · config ${run.configHash ?? '—'}`,
    `Run: ${run.replayOf ? 're-scored offline' : minutes ? `${minutes} min` : 'in progress'}, ${run.unitsUsed} quota units, ${run.keywordsSearched} keywords, ${run.videosSeen} videos scanned, ${q?.finalOutliers ?? run.outliers.length} outliers. Status: ${STATUS_LABEL[run.status]}.`,
    '',
  ];
  if (q) {
    let layer2 = 'not run';
    const l2 = q.layer2;
    if (l2) {
      if (l2.status === 'run' || l2.status === 'partial') {
        layer2 = `${l2.status === 'run' ? 'run' : 'partial'} — ${l2.labelled} labelled${l2.fromCache ? ` (${l2.fromCache} from cache)` : ''}, ${l2.kept} EXPLAINER kept${l2.error ? `; stopped: ${l2.error}` : ''}`;
      } else if (l2.status === 'failed') {
        layer2 = `failed — ${l2.error ?? 'unknown error'}; layer 1 only`;
      } else if (l2.status === 'off') {
        layer2 = 'off (Settings → Research)';
      }
    }
    lines.push(
      '## Run quality',
      `- Scanned: ${q.scanned}`,
      `- Passed relevance (layer 1): ${q.passedLayer1}${q.longShorts ? `; ${q.longShorts} over 60 s filtered as "Long Short"` : ''}`,
      `- Layer 2 (LLM): ${layer2}`,
      `- Final outliers: ${q.finalOutliers} (${(q.outlierRate * 100).toFixed(1)}% of scanned); ${q.shown} shown after the per-channel and duplicate limits`,
      `- Views ÷ subscribers threshold: ${q.minSubRatio}×${q.raised ? ' (raised automatically to keep the outlier rate under 15%)' : ''}`,
      `- Breakout: ${q.breakoutChannels ? `${q.breakoutChannels} channels' recent Shorts read` : 'not available for this run'}`,
      '',
    );
  }
  lines.push(
    '## Top 25 Outliers',
    '| # | Title | Channel | Views | Subs | Views/Subs | Breakout | VPH | Len | Flags | Link |',
    '|---|-------|---------|-------|------|-----------|----------|-----|-----|-------|------|',
  );
  (run.outliers as any[]).slice(0, 25).forEach((o, i) => {
    const notes = [
      o.duplicates ? `×${o.duplicates + 1} similar` : '',
      o.moreFromChannel ? `+${o.moreFromChannel} more from this channel` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const flags = [...(o.flags ?? []), notes].filter(Boolean).join(', ') || '—';
    lines.push(
      `| ${i + 1} | ${cell(o.titleClean ?? o.title)}${o.isNew ? ' 🆕' : ''} | ${cell(o.channelTitle)} | ${fmt(o.views)} | ${
        o.subs !== null ? fmt(o.subs) : 'hidden'
      } | ${ratio(o.subRatio)} | ${ratio(o.breakout)} | ${fmt(o.vph)} | ${durationLabel(o.durationSec)} | ${flags} | ${shortsLink(o.videoId)} |`,
    );
  });
  if (!run.outliers.length) lines.push('| — | No outliers matched the filters. | | | | | | | | | |');
  lines.push(
    '',
    '## Keyword performance',
    '| Keyword | Results | Outliers | Hit rate | Junk rate | Suggestion |',
    '|---|---|---|---|---|---|',
  );
  for (const k of run.keywordStats as any[]) {
    if (!k.searched) {
      lines.push(`| ${cell(k.keyword)} | — | — | — | — | ${k.error ? `Error: ${cell(k.error)}` : 'Not searched'} |`);
      continue;
    }
    const hit = k.hitRate ?? (k.found ? k.outliers / k.found : 0);
    const label = k.label ?? (k.outliers ? 'Keep' : 'Watch');
    const suggestion = label === 'Rephrase' && k.topJunk ? `Rephrase (mostly ${k.topJunk})` : label;
    lines.push(
      `| ${cell(k.keyword)} | ${k.found}${k.lowResults ? ' ⚠' : ''} | ${k.outliers} | ${(hit * 100).toFixed(0)}% | ${
        k.junkRate !== undefined ? `${(k.junkRate * 100).toFixed(0)}%` : '—'
      } | ${suggestion} |`,
    );
  }
  const low = (run.keywordStats as any[]).filter((k) => k.lowResults);
  if (low.length) {
    lines.push('', `⚠ Fewer than 50 results with no error: ${low.map((k) => `"${k.keyword}" (${k.found})`).join(', ')}.`);
  }
  if (run.filteredOut?.length) {
    lines.push(
      '',
      `<details><summary>Filtered out (${run.filteredOut.length})</summary>`,
      '',
      '| Title | Channel | Reason | Views |',
      '|---|---|---|---|',
    );
    for (const f of (run.filteredOut as any[]).slice(0, 20)) {
      lines.push(`| ${cell(f.title)} | ${cell(f.channelTitle)} | ${cell(f.reason)} | ${fmt(f.views)} |`);
    }
    lines.push('', '</details>');
  }
  lines.push('', '## Notes');
  if (run.status !== 'complete') lines.push(`- ${STATUS_LABEL[run.status]}.`);
  for (const n of run.notes as string[]) lines.push(`- ${n}`);
  if (run.status === 'complete' && !run.notes.length) lines.push('- Complete run, no errors.');
  lines.push(
    q?.breakoutChannels
      ? '- Breakout = views ÷ the median of the channel\'s last 30 Shorts (this one left out); "—" means fewer than 3 others to compare.'
      : '- No breakout for this run: ranked by views ÷ subscribers and views per hour, weighted by channel size.',
    '- Hit rate = EXPLAINER outliers ÷ results. Loop-inflated Shorts (under 12 s) rank at half their score.',
  );
  return `${lines.join('\n')}\n`;
}

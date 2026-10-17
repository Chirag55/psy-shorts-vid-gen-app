import { Alert } from 'react-native';
import { TOPIC_BANK_V2 } from '@/assets/topicBankV2';
import { planAutoImport } from '@/core/autoImport';
import { useStudio } from '@/store';

/** Imports the bundled bank when it (or the accepted conditional Shorts) changed. True when it imported. */
export function runAutoImport(now: number = Date.now()): boolean {
  const s = useStudio.getState();
  const result = planAutoImport(
    TOPIC_BANK_V2,
    s.bank,
    s.bankMeta,
    s.bankAuto,
    s.acceptedConditional,
    now,
    s.settings.neutralTerms,
  );
  if (!result) return false;
  s.applyAutoImport(result as any);
  return true;
}

/** Tells the user once what the last auto-import did. */
export function showAutoImportNotice(): void {
  const s = useStudio.getState();
  const rec = s.bankAuto;
  if (!rec || rec.seen) return;
  s.acknowledgeBankImport();
  const parts: string[] = [
    ...rec.lines.slice(0, 4),
    ...(rec.rejected.length
      ? [`${rec.rejected.length} entr${rec.rejected.length === 1 ? 'y' : 'ies'} refused: ${rec.rejected[0]}`]
      : []),
    ...(rec.conditional.length
      ? [
          `${rec.conditional.length} conditional Short${rec.conditional.length === 1 ? '' : 's'} waiting for your answer in the Topic Bank.`,
        ]
      : []),
  ];
  Alert.alert('Topic bank updated', parts.join('\n\n'));
}

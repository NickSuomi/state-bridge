import { buildSnapshotSummary, hasSelectedStorage } from './snapshot';
import type { Settings, Snapshot, StorageSelection } from './types';

export interface DerivedPopupState {
  canCapture: boolean;
  canApply: boolean;
  summaryText: string;
}

export function derivePopupState(
  snapshot: Snapshot | null,
  settings: Settings,
  selection: StorageSelection,
): DerivedPopupState {
  const summary = buildSnapshotSummary(snapshot);
  const canUseSelection = hasSelectedStorage(selection);

  if (summary === null) {
    return {
      canCapture: canUseSelection,
      canApply: false,
      summaryText: 'No snapshot captured yet.',
    };
  }

  const storageParts: string[] = [];
  if (summary.counts.local > 0 || settings.defaultSelection.local) {
    storageParts.push(`LS ${summary.counts.local}`);
  }
  if (summary.counts.session > 0 || settings.defaultSelection.session) {
    storageParts.push(`SS ${summary.counts.session}`);
  }

  return {
    canCapture: canUseSelection,
    canApply: canUseSelection,
    summaryText: `Captured from ${summary.sourceUrl} at ${summary.capturedAt} (${storageParts.join(', ')})`,
  };
}

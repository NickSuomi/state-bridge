import type {
  Snapshot,
  SnapshotSummary,
  StorageAreaSnapshot,
  StorageSelection,
} from './types';

export function hasSelectedStorage(selection: StorageSelection): boolean {
  return selection.local || selection.session;
}

export function createEmptyArea(): StorageAreaSnapshot {
  return {};
}

export function buildSnapshotSummary(snapshot: Snapshot | null): SnapshotSummary | null {
  if (snapshot === null) {
    return null;
  }

  return {
    sourceUrl: snapshot.sourceUrl,
    capturedAt: snapshot.capturedAt,
    counts: {
      local: Object.keys(snapshot.localStorage).length,
      session: Object.keys(snapshot.sessionStorage).length,
    },
  };
}

export function filterSnapshot(snapshot: Snapshot, selection: StorageSelection): Snapshot {
  return {
    ...snapshot,
    localStorage: selection.local ? snapshot.localStorage : {},
    sessionStorage: selection.session ? snapshot.sessionStorage : {},
  };
}

export function replaceStorageArea(
  currentState: StorageAreaSnapshot,
  nextState: StorageAreaSnapshot,
  enabled: boolean,
): StorageAreaSnapshot {
  if (!enabled) {
    return currentState;
  }

  return { ...nextState };
}

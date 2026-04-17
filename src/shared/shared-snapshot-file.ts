import type { FailureResult, SharedSnapshotFile, Snapshot, StorageAreaSnapshot } from './types';

const SHARED_SNAPSHOT_FILE_KIND = 'state-bridge-snapshot';
const SHARED_SNAPSHOT_FILE_VERSION = 1;

function makeFailure(
  code: FailureResult['error']['code'],
  message: string,
): FailureResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStorageAreaSnapshot(value: unknown): value is StorageAreaSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sourceUrl === 'string' &&
    typeof value.capturedAt === 'string' &&
    isStorageAreaSnapshot(value.localStorage) &&
    isStorageAreaSnapshot(value.sessionStorage)
  );
}

export function buildSharedSnapshotFile(snapshot: Snapshot): SharedSnapshotFile {
  return {
    kind: SHARED_SNAPSHOT_FILE_KIND,
    version: SHARED_SNAPSHOT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot,
  };
}

export function buildSharedSnapshotFilename(snapshot: Snapshot): string {
  let host = 'unknown-host';

  try {
    host = new URL(snapshot.sourceUrl).host || host;
  } catch {
    host = snapshot.sourceUrl || host;
  }

  const safeHost = host.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown-host';
  const safeTimestamp = snapshot.capturedAt.replace(/[:.]/g, '-');

  return `state-bridge-${safeHost}-${safeTimestamp}.json`;
}

export function serializeSharedSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(buildSharedSnapshotFile(snapshot), null, 2);
}

export function parseSharedSnapshot(text: string): { ok: true; file: SharedSnapshotFile } | FailureResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return makeFailure('invalid_snapshot_file', 'Snapshot file is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    return makeFailure('invalid_snapshot_file', 'Snapshot file must contain an object payload.');
  }

  if (parsed.kind !== SHARED_SNAPSHOT_FILE_KIND) {
    return makeFailure('invalid_snapshot_file', 'Snapshot file kind is not supported.');
  }

  if (parsed.version !== SHARED_SNAPSHOT_FILE_VERSION) {
    return makeFailure('unsupported_snapshot_version', 'Snapshot file version is not supported.');
  }

  if (typeof parsed.exportedAt !== 'string') {
    return makeFailure('invalid_snapshot_file', 'Snapshot file is missing exportedAt metadata.');
  }

  if (!isSnapshot(parsed.snapshot)) {
    return makeFailure('invalid_snapshot_file', 'Snapshot file payload is invalid.');
  }

  return {
    ok: true,
    file: {
      kind: SHARED_SNAPSHOT_FILE_KIND,
      version: SHARED_SNAPSHOT_FILE_VERSION,
      exportedAt: parsed.exportedAt,
      snapshot: parsed.snapshot,
    },
  };
}

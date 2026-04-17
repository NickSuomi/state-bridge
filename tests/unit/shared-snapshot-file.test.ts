import { describe, expect, it } from 'vitest';

import {
  buildSharedSnapshotFile,
  parseSharedSnapshot,
  serializeSharedSnapshot,
} from '../../src/shared/shared-snapshot-file';
import type { Snapshot } from '../../src/shared/types';

const snapshot: Snapshot = {
  sourceUrl: 'https://prod.example.com/app',
  capturedAt: '2026-03-24T19:00:00.000Z',
  localStorage: {
    auth: 'token',
  },
  sessionStorage: {
    wizard: 'step-3',
  },
};

describe('shared snapshot file helpers', () => {
  it('serializes and parses a valid shared snapshot file', () => {
    const serialized = serializeSharedSnapshot(snapshot);
    const parsed = parseSharedSnapshot(serialized);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error('Expected shared snapshot parse to succeed.');
    }

    expect(parsed.file.snapshot).toEqual(snapshot);
    expect(parsed.file).toMatchObject({
      kind: buildSharedSnapshotFile(snapshot).kind,
      version: buildSharedSnapshotFile(snapshot).version,
      snapshot,
    });
    expect(parsed.file.exportedAt).toEqual(expect.any(String));
  });

  it('rejects a wrong file kind', () => {
    const parsed = parseSharedSnapshot(
      JSON.stringify({
        kind: 'wrong-kind',
        version: 1,
        exportedAt: '2026-03-24T19:00:00.000Z',
        snapshot,
      }),
    );

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'invalid_snapshot_file',
        message: 'Snapshot file kind is not supported.',
      },
    });
  });

  it('rejects an unsupported version', () => {
    const parsed = parseSharedSnapshot(
      JSON.stringify({
        kind: 'state-bridge-snapshot',
        version: 2,
        exportedAt: '2026-03-24T19:00:00.000Z',
        snapshot,
      }),
    );

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'unsupported_snapshot_version',
        message: 'Snapshot file version is not supported.',
      },
    });
  });

  it('rejects a missing snapshot payload', () => {
    const parsed = parseSharedSnapshot(
      JSON.stringify({
        kind: 'state-bridge-snapshot',
        version: 1,
        exportedAt: '2026-03-24T19:00:00.000Z',
      }),
    );

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'invalid_snapshot_file',
        message: 'Snapshot file payload is invalid.',
      },
    });
  });

  it('rejects non-string storage values', () => {
    const parsed = parseSharedSnapshot(
      JSON.stringify({
        kind: 'state-bridge-snapshot',
        version: 1,
        exportedAt: '2026-03-24T19:00:00.000Z',
        snapshot: {
          ...snapshot,
          localStorage: {
            auth: 42,
          },
        },
      }),
    );

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'invalid_snapshot_file',
        message: 'Snapshot file payload is invalid.',
      },
    });
  });
});

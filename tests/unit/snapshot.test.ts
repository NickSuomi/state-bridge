import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { derivePopupState } from '../../src/shared/popup-state';
import {
  buildSnapshotSummary,
  filterSnapshot,
  hasSelectedStorage,
  replaceStorageArea,
} from '../../src/shared/snapshot';
import type { Snapshot } from '../../src/shared/types';

const snapshot: Snapshot = {
  sourceUrl: 'https://prod.example.com/app',
  capturedAt: '2026-03-24T19:00:00.000Z',
  localStorage: {
    auth: 'token',
    feature: 'on',
  },
  sessionStorage: {
    modal: 'open',
  },
};

describe('snapshot helpers', () => {
  it('detects selected storage', () => {
    expect(hasSelectedStorage({ local: true, session: false })).toBe(true);
    expect(hasSelectedStorage({ local: false, session: false })).toBe(false);
  });

  it('builds a summary from snapshot payload', () => {
    expect(buildSnapshotSummary(snapshot)).toEqual({
      sourceUrl: snapshot.sourceUrl,
      capturedAt: snapshot.capturedAt,
      counts: {
        local: 2,
        session: 1,
      },
    });
  });

  it('filters unselected storage areas out of the snapshot', () => {
    expect(filterSnapshot(snapshot, { local: true, session: false })).toEqual({
      ...snapshot,
      sessionStorage: {},
    });
  });

  it('replaces target area entirely when enabled', () => {
    const currentState = { stale: 'value', auth: 'old' };

    expect(replaceStorageArea(currentState, snapshot.localStorage, true)).toEqual(snapshot.localStorage);
    expect(replaceStorageArea(currentState, snapshot.localStorage, false)).toEqual(currentState);
  });

  it('derives popup state from snapshot presence and selection', () => {
    const popupState = derivePopupState(snapshot, DEFAULT_SETTINGS, { local: true, session: true });

    expect(popupState.canCapture).toBe(true);
    expect(popupState.canApply).toBe(true);
    expect(popupState.summaryText).toContain('prod.example.com');
    expect(popupState.summaryText).toContain('LS 2');
    expect(popupState.summaryText).toContain('SS 1');
  });

  it('keeps apply disabled when there is no snapshot', () => {
    const popupState = derivePopupState(null, DEFAULT_SETTINGS, { local: true, session: true });

    expect(popupState.canCapture).toBe(true);
    expect(popupState.canApply).toBe(false);
  });
});

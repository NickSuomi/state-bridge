import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import { buildSnapshotSummary } from './snapshot';
import type { ExtensionState, Settings, Snapshot } from './types';

export async function getSnapshot(): Promise<Snapshot | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
  return (result[STORAGE_KEYS.snapshot] as Snapshot | undefined) ?? null;
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.snapshot]: snapshot });
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return ((result[STORAGE_KEYS.settings] as Settings | undefined) ?? DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getExtensionState(): Promise<ExtensionState> {
  const [settings, snapshot] = await Promise.all([getSettings(), getSnapshot()]);

  return {
    settings,
    snapshot,
    snapshotSummary: buildSnapshotSummary(snapshot),
  };
}

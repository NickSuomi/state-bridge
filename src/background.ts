import { DEFAULT_SETTINGS } from './shared/constants';
import { matchAllowlist, normalizeAllowlistEntries } from './shared/allowlist';
import {
  buildSharedSnapshotFilename,
  parseSharedSnapshot,
  serializeSharedSnapshot,
} from './shared/shared-snapshot-file';
import { filterSnapshot, hasSelectedStorage } from './shared/snapshot';
import { getExtensionState, getSettings, getSnapshot, saveSettings, saveSnapshot } from './shared/storage';
import type {
  ApplyResult,
  CaptureResult,
  ExportSnapshotResult,
  FailureResult,
  ImportSnapshotResult,
  RuntimeMessage,
  SaveSettingsResult,
  Settings,
  Snapshot,
  StorageAreaSnapshot,
  StorageSelection,
} from './shared/types';

interface CapturePayload {
  localStorage: StorageAreaSnapshot;
  sessionStorage: StorageAreaSnapshot;
}

interface ScriptResult<T> {
  ok: true;
  value: T;
}

interface ScriptFailure {
  ok: false;
  message: string;
}

function makeFailure(code: FailureResult['error']['code'], message: string): FailureResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

async function ensureSettings(): Promise<Settings> {
  const settings = await getSettings();

  if (settings.allowlist.length === 0) {
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  return settings;
}

async function resolveTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  if (typeof tabId === 'number') {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  return tabs[0] ?? null;
}

function readStorageInPage(selection: StorageSelection): ScriptResult<CapturePayload> | ScriptFailure {
  try {
    const payload: CapturePayload = {
      localStorage: {},
      sessionStorage: {},
    };

    if (selection.local) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key !== null) {
          payload.localStorage[key] = window.localStorage.getItem(key) ?? '';
        }
      }
    }

    if (selection.session) {
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key !== null) {
          payload.sessionStorage[key] = window.sessionStorage.getItem(key) ?? '';
        }
      }
    }

    return { ok: true, value: payload };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown storage capture failure.',
    };
  }
}

function isScriptFailure<T>(value: ScriptResult<T> | ScriptFailure | undefined): value is ScriptFailure {
  return value !== undefined && value.ok === false;
}

function writeStorageInPage(snapshot: Snapshot, selection: StorageSelection): ScriptResult<true> | ScriptFailure {
  try {
    if (selection.local) {
      window.localStorage.clear();
      for (const [key, value] of Object.entries(snapshot.localStorage)) {
        window.localStorage.setItem(key, value);
      }
    }

    if (selection.session) {
      window.sessionStorage.clear();
      for (const [key, value] of Object.entries(snapshot.sessionStorage)) {
        window.sessionStorage.setItem(key, value);
      }
    }

    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown storage apply failure.',
    };
  }
}

async function captureSnapshot(selection: StorageSelection, tabId?: number): Promise<CaptureResult> {
  if (!hasSelectedStorage(selection)) {
    return makeFailure('nothing_selected', 'Select localStorage and/or sessionStorage first.');
  }

  const targetTab = await resolveTab(tabId);

  if (targetTab?.id === undefined || targetTab.url === undefined) {
    return makeFailure('tab_not_found', 'Could not resolve the active source tab.');
  }

  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      world: 'MAIN',
      func: readStorageInPage,
      args: [selection],
    });

    const scriptResult = injectionResult.result;
    if (scriptResult === undefined) {
      return makeFailure('capture_failed', 'Capture script returned no result.');
    }

    if (isScriptFailure(scriptResult)) {
      return makeFailure('capture_failed', scriptResult.message);
    }

    const snapshot: Snapshot = {
      sourceUrl: targetTab.url,
      capturedAt: new Date().toISOString(),
      localStorage: scriptResult.value.localStorage,
      sessionStorage: scriptResult.value.sessionStorage,
    };

    await saveSnapshot(filterSnapshot(snapshot, selection));

    return {
      ok: true,
      snapshot,
    };
  } catch (error) {
    return makeFailure(
      'capture_failed',
      error instanceof Error ? error.message : 'Failed to capture storage from the source tab.',
    );
  }
}

async function applySnapshot(
  selection: StorageSelection,
  overrideAllowlist: boolean,
  tabId?: number,
): Promise<ApplyResult> {
  if (!hasSelectedStorage(selection)) {
    return makeFailure('nothing_selected', 'Select localStorage and/or sessionStorage first.');
  }

  const [settings, snapshot, targetTab] = await Promise.all([getSettings(), getSnapshot(), resolveTab(tabId)]);

  if (snapshot === null) {
    return makeFailure('no_snapshot', 'Capture a snapshot before applying it.');
  }

  if (targetTab?.id === undefined || targetTab.url === undefined) {
    return makeFailure('tab_not_found', 'Could not resolve the active target tab.');
  }

  const allowlistMatch = matchAllowlist(targetTab.url, settings.allowlist);
  if (!allowlistMatch.allowed && !overrideAllowlist) {
    return {
      ok: false,
      error: {
        code: 'target_not_allowed',
        message: 'Target tab is outside the allowlist. Review the URL or apply with explicit override.',
      },
      targetUrl: targetTab.url,
      requiresOverride: true,
    };
  }

  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      world: 'MAIN',
      func: writeStorageInPage,
      args: [filterSnapshot(snapshot, selection), selection],
    });

    const scriptResult = injectionResult.result;
    if (scriptResult === undefined) {
      return makeFailure('apply_failed', 'Apply script returned no result.');
    }

    if (isScriptFailure(scriptResult)) {
      return makeFailure('apply_failed', scriptResult.message);
    }

    if (settings.autoReload) {
      await chrome.tabs.reload(targetTab.id);
    }

    return {
      ok: true,
      targetUrl: targetTab.url,
      reloaded: settings.autoReload,
    };
  } catch (error) {
    return makeFailure(
      'apply_failed',
      error instanceof Error ? error.message : 'Failed to apply snapshot to the target tab.',
    );
  }
}

async function saveAllowlist(allowlistEntries: string[]): Promise<SaveSettingsResult> {
  const currentSettings = await getSettings();
  const normalized = normalizeAllowlistEntries(allowlistEntries);
  const settings: Settings = {
    ...currentSettings,
    allowlist: normalized.rules,
  };

  await saveSettings(settings);

  return {
    ok: true,
    settings,
    invalidEntries: normalized.invalidEntries,
  };
}

async function exportSnapshot(): Promise<ExportSnapshotResult> {
  const snapshot = await getSnapshot();

  if (snapshot === null) {
    return makeFailure('no_snapshot', 'Capture or import a snapshot before exporting it.');
  }

  return {
    ok: true,
    fileName: buildSharedSnapshotFilename(snapshot),
    fileContent: serializeSharedSnapshot(snapshot),
  };
}

async function importSnapshot(fileContent: string): Promise<ImportSnapshotResult> {
  const parsed = parseSharedSnapshot(fileContent);

  if (!parsed.ok) {
    return parsed;
  }

  await saveSnapshot(parsed.file.snapshot);

  return {
    ok: true,
    snapshot: parsed.file.snapshot,
    snapshotSummary: {
      sourceUrl: parsed.file.snapshot.sourceUrl,
      capturedAt: parsed.file.snapshot.capturedAt,
      counts: {
        local: Object.keys(parsed.file.snapshot.localStorage).length,
        session: Object.keys(parsed.file.snapshot.sessionStorage).length,
      },
    },
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case 'get-state':
        sendResponse(await getExtensionState());
        return;
      case 'capture':
        sendResponse(await captureSnapshot(message.selection, message.tabId));
        return;
      case 'apply':
        sendResponse(
          await applySnapshot(message.selection, Boolean(message.overrideAllowlist), message.tabId),
        );
        return;
      case 'export-snapshot':
        sendResponse(await exportSnapshot());
        return;
      case 'import-snapshot':
        sendResponse(await importSnapshot(message.fileContent));
        return;
      case 'save-settings':
        sendResponse(await saveAllowlist(message.allowlistEntries));
        return;
      default:
        sendResponse(makeFailure('settings_invalid', 'Unsupported runtime message.'));
    }
  })();

  return true;
});

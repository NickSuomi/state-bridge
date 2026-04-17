import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import type {
  ApplyResult,
  CaptureResult,
  ExportSnapshotResult,
  ExtensionState,
  ImportSnapshotResult,
  SaveSettingsResult,
} from '../../src/shared/types';

declare global {
  interface Window {
    renderState: () => void;
  }
}

const extensionPath = path.join(process.cwd(), 'dist');

interface ExtensionHarness {
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
  controlPage: Page;
}

async function launchExtensionHarness(): Promise<ExtensionHarness> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-bridge-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (serviceWorker === undefined) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const extensionId = new URL(serviceWorker.url()).host;
  const controlPage = await context.newPage();
  await controlPage.goto(`chrome-extension://${extensionId}/options.html`);

  return { context, extensionId, userDataDir, controlPage };
}

async function closeHarness(harness: ExtensionHarness): Promise<void> {
  await harness.context.close();
  fs.rmSync(harness.userDataDir, { recursive: true, force: true });
}

async function findTabId(controlPage: Page, urlPrefix: string): Promise<number> {
  return controlPage.evaluate(async (prefix) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(prefix));
    if (tab?.id === undefined) {
      throw new Error(`Could not find tab with URL prefix ${prefix}.`);
    }

    return tab.id;
  }, urlPrefix);
}

async function sendRuntimeMessage<T>(controlPage: Page, message: object): Promise<T> {
  return controlPage.evaluate((payload) => chrome.runtime.sendMessage(payload), message) as Promise<T>;
}

async function setAllowlist(controlPage: Page, entries: string[]): Promise<SaveSettingsResult> {
  return sendRuntimeMessage<SaveSettingsResult>(controlPage, {
    type: 'save-settings',
    allowlistEntries: entries,
  });
}

async function seedStorage(
  page: Page,
  values: {
    local?: Record<string, string>;
    session?: Record<string, string>;
  },
): Promise<void> {
  await page.evaluate((payload) => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    for (const [key, value] of Object.entries(payload.local ?? {})) {
      window.localStorage.setItem(key, value);
    }

    for (const [key, value] of Object.entries(payload.session ?? {})) {
      window.sessionStorage.setItem(key, value);
    }

    window.renderState();
  }, values);
}

async function readStorage(page: Page): Promise<{
  local: Record<string, string>;
  session: Record<string, string>;
}> {
  return page.evaluate(() => {
    function dump(storage: Storage): Record<string, string> {
      const entries: Record<string, string> = {};
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) {
          entries[key] = storage.getItem(key) ?? '';
        }
      }
      return entries;
    }

    return {
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
    };
  });
}

test.describe('State Bridge extension', () => {
  test('captures localStorage and applies it to a localhost target', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const targetPage = await harness.context.newPage();

      await sourcePage.goto('http://127.0.0.1:4173/source.html');
      await targetPage.goto('http://localhost:4173/target.html');

      await seedStorage(sourcePage, { local: { auth: 'token-1', feature: 'on' } });
      await seedStorage(targetPage, { local: { stale: 'value' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/source.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target.html');

      const captureResult = await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });
      expect(captureResult.ok).toBe(true);

      const reloadPromise = targetPage.waitForEvent('framenavigated');
      const applyResult = await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(true);
      await reloadPromise;
      await targetPage.waitForLoadState('load');

      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'token-1', feature: 'on' },
        session: {},
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('captures and reapplies both localStorage and sessionStorage', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const targetPage = await harness.context.newPage();

      await sourcePage.goto('http://127.0.0.1:4173/source-both.html');
      await targetPage.goto('http://localhost:4173/target-both.html');

      await seedStorage(sourcePage, {
        local: { auth: 'token-2' },
        session: { wizard: 'step-3' },
      });

      const sourceTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/source-both.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target-both.html');

      await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: true },
        tabId: sourceTabId,
      });

      const reloadPromise = targetPage.waitForEvent('framenavigated');
      await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: true },
        tabId: targetTabId,
      });

      await reloadPromise;
      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'token-2' },
        session: { wizard: 'step-3' },
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('replaces existing target keys instead of merging', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const targetPage = await harness.context.newPage();

      await sourcePage.goto('http://127.0.0.1:4173/source-replace.html');
      await targetPage.goto('http://localhost:4173/target-replace.html');

      await seedStorage(sourcePage, { local: { auth: 'fresh' } });
      await seedStorage(targetPage, { local: { stale: 'value', auth: 'old' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/source-replace.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target-replace.html');

      await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });

      const reloadPromise = targetPage.waitForEvent('framenavigated');
      await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });
      await reloadPromise;

      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'fresh' },
        session: {},
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('warns when target is outside the allowlist', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const blockedTarget = await harness.context.newPage();

      await sourcePage.goto('http://localhost:4173/source-blocked.html');
      await blockedTarget.goto('http://127.0.0.1:4173/target-blocked.html');

      await seedStorage(sourcePage, { local: { auth: 'token-3' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://localhost:4173/source-blocked.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/target-blocked.html');

      await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });

      const applyResult = await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(false);
      if (applyResult.ok) {
        throw new Error('Expected allowlist warning.');
      }
      expect(applyResult.error.code).toBe('target_not_allowed');
    } finally {
      await closeHarness(harness);
    }
  });

  test('supports explicit override for a blocked target', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const blockedTarget = await harness.context.newPage();

      await sourcePage.goto('http://localhost:4173/source-override.html');
      await blockedTarget.goto('http://127.0.0.1:4173/target-override.html');

      await seedStorage(sourcePage, { local: { auth: 'token-4' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://localhost:4173/source-override.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/target-override.html');

      await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });

      const reloadPromise = blockedTarget.waitForEvent('framenavigated');
      const applyResult = await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        overrideAllowlist: true,
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(true);
      await reloadPromise;
      expect(await readStorage(blockedTarget)).toEqual({
        local: { auth: 'token-4' },
        session: {},
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('returns a clear error when apply is attempted without a snapshot', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const targetPage = await harness.context.newPage();
      await targetPage.goto('http://localhost:4173/target-empty.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target-empty.html');

      const applyResult = await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(false);
      if (applyResult.ok) {
        throw new Error('Expected missing snapshot failure.');
      }
      expect(applyResult.error.code).toBe('no_snapshot');
    } finally {
      await closeHarness(harness);
    }
  });

  test('exports from one extension install and imports into another before apply', async () => {
    const sourceHarness = await launchExtensionHarness();
    const targetHarness = await launchExtensionHarness();

    try {
      await setAllowlist(targetHarness.controlPage, ['localhost']);
      const sourcePage = await sourceHarness.context.newPage();
      const targetPage = await targetHarness.context.newPage();

      await sourcePage.goto('http://127.0.0.1:4173/source-share.html');
      await targetPage.goto('http://localhost:4173/target-share.html');

      await seedStorage(sourcePage, { local: { auth: 'shared-token', feature: 'on' } });
      await seedStorage(targetPage, { local: { stale: 'value' } });

      const sourceTabId = await findTabId(sourceHarness.controlPage, 'http://127.0.0.1:4173/source-share.html');
      const targetTabId = await findTabId(targetHarness.controlPage, 'http://localhost:4173/target-share.html');

      await sendRuntimeMessage<CaptureResult>(sourceHarness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });

      const exportResult = await sendRuntimeMessage<ExportSnapshotResult>(sourceHarness.controlPage, {
        type: 'export-snapshot',
      });

      expect(exportResult.ok).toBe(true);
      if (!exportResult.ok) {
        throw new Error('Expected export to succeed.');
      }

      const importResult = await sendRuntimeMessage<ImportSnapshotResult>(targetHarness.controlPage, {
        type: 'import-snapshot',
        fileContent: exportResult.fileContent,
      });

      expect(importResult.ok).toBe(true);

      const reloadPromise = targetPage.waitForEvent('framenavigated');
      const applyResult = await sendRuntimeMessage<ApplyResult>(targetHarness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(true);
      await reloadPromise;

      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'shared-token', feature: 'on' },
        session: {},
      });
    } finally {
      await closeHarness(sourceHarness);
      await closeHarness(targetHarness);
    }
  });

  test('applies imported snapshot with current selection toggles', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const targetPage = await harness.context.newPage();
      await targetPage.goto('http://localhost:4173/target-import-toggle.html');
      await seedStorage(targetPage, {
        local: { stale: 'value' },
        session: { wizard: 'old-step' },
      });

      const importResult = await sendRuntimeMessage<ImportSnapshotResult>(harness.controlPage, {
        type: 'import-snapshot',
        fileContent: JSON.stringify({
          kind: 'state-bridge-snapshot',
          version: 1,
          exportedAt: '2026-03-24T19:01:00.000Z',
          snapshot: {
            sourceUrl: 'https://prod.example.com/share',
            capturedAt: '2026-03-24T19:00:00.000Z',
            localStorage: { auth: 'token-5' },
            sessionStorage: { wizard: 'step-4' },
          },
        }),
      });

      expect(importResult.ok).toBe(true);

      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target-import-toggle.html');
      const reloadPromise = targetPage.waitForEvent('framenavigated');
      await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });
      await reloadPromise;

      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'token-5' },
        session: { wizard: 'old-step' },
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('still warns on blocked target after importing a snapshot file', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const blockedTarget = await harness.context.newPage();
      await blockedTarget.goto('http://127.0.0.1:4173/target-import-blocked.html');

      const importResult = await sendRuntimeMessage<ImportSnapshotResult>(harness.controlPage, {
        type: 'import-snapshot',
        fileContent: JSON.stringify({
          kind: 'state-bridge-snapshot',
          version: 1,
          exportedAt: '2026-03-24T19:01:00.000Z',
          snapshot: {
            sourceUrl: 'https://prod.example.com/share',
            capturedAt: '2026-03-24T19:00:00.000Z',
            localStorage: { auth: 'token-6' },
            sessionStorage: {},
          },
        }),
      });

      expect(importResult.ok).toBe(true);

      const targetTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/target-import-blocked.html');
      const applyResult = await sendRuntimeMessage<ApplyResult>(harness.controlPage, {
        type: 'apply',
        selection: { local: true, session: false },
        tabId: targetTabId,
      });

      expect(applyResult.ok).toBe(false);
      if (applyResult.ok) {
        throw new Error('Expected allowlist warning after import.');
      }
      expect(applyResult.error.code).toBe('target_not_allowed');
    } finally {
      await closeHarness(harness);
    }
  });

  test('does not replace existing snapshot when import file is invalid', async () => {
    const harness = await launchExtensionHarness();

    try {
      const sourcePage = await harness.context.newPage();
      await sourcePage.goto('http://127.0.0.1:4173/source-invalid-import.html');
      await seedStorage(sourcePage, { local: { auth: 'kept-token' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/source-invalid-import.html');
      await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: sourceTabId,
      });

      const importResult = await sendRuntimeMessage<ImportSnapshotResult>(harness.controlPage, {
        type: 'import-snapshot',
        fileContent: '{',
      });

      expect(importResult.ok).toBe(false);
      if (importResult.ok) {
        throw new Error('Expected invalid import failure.');
      }

      const state = await sendRuntimeMessage<ExtensionState>(harness.controlPage, { type: 'get-state' });

      expect(state.snapshot?.localStorage).toEqual({ auth: 'kept-token' });
    } finally {
      await closeHarness(harness);
    }
  });

  test('returns a clear error when export is attempted without a snapshot', async () => {
    const harness = await launchExtensionHarness();

    try {
      const exportResult = await sendRuntimeMessage<ExportSnapshotResult>(harness.controlPage, {
        type: 'export-snapshot',
      });

      expect(exportResult.ok).toBe(false);
      if (exportResult.ok) {
        throw new Error('Expected export failure.');
      }
      expect(exportResult.error.code).toBe('no_snapshot');
    } finally {
      await closeHarness(harness);
    }
  });

  test('fails gracefully on unsupported pages', async () => {
    const harness = await launchExtensionHarness();

    try {
      const blankPage = await harness.context.newPage();
      await blankPage.goto('about:blank');
      const blankTabId = await findTabId(harness.controlPage, 'about:blank');

      const captureResult = await sendRuntimeMessage<CaptureResult>(harness.controlPage, {
        type: 'capture',
        selection: { local: true, session: false },
        tabId: blankTabId,
      });

      expect(captureResult.ok).toBe(false);
      if (captureResult.ok) {
        throw new Error('Expected capture failure.');
      }
      expect(captureResult.error.code).toBe('capture_failed');
    } finally {
      await closeHarness(harness);
    }
  });

  test('supports capture and apply from the popup buttons', async () => {
    const harness = await launchExtensionHarness();

    try {
      await setAllowlist(harness.controlPage, ['localhost']);
      const sourcePage = await harness.context.newPage();
      const targetPage = await harness.context.newPage();

      await sourcePage.goto('http://127.0.0.1:4173/source-kbd.html');
      await targetPage.goto('http://localhost:4173/target-kbd.html');

      await seedStorage(sourcePage, { local: { auth: 'kbd-token' } });
      await seedStorage(targetPage, { local: { stale: 'value' } });

      const sourceTabId = await findTabId(harness.controlPage, 'http://127.0.0.1:4173/source-kbd.html');
      const targetTabId = await findTabId(harness.controlPage, 'http://localhost:4173/target-kbd.html');

      const popupPage = await harness.context.newPage();
      await popupPage.goto(
        `chrome-extension://${harness.extensionId}/popup.html?captureTabId=${sourceTabId}&applyTabId=${targetTabId}`,
      );

      const popupMetrics = await popupPage.evaluate(() => ({
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(popupMetrics.scrollHeight).toBeLessThanOrEqual(popupMetrics.innerHeight);
      expect(popupMetrics.scrollWidth).toBeLessThanOrEqual(popupMetrics.innerWidth);

      await popupPage.getByRole('button', { name: 'Capture' }).click();
      await expect(popupPage.locator('body')).toContainText('Captured from 127.0.0.1:4173.');

      const reloadPromise = targetPage.waitForEvent('framenavigated');
      await popupPage.getByRole('button', { name: 'Apply' }).click();
      await reloadPromise;

      expect(await readStorage(targetPage)).toEqual({
        local: { auth: 'kbd-token' },
        session: {},
      });
    } finally {
      await closeHarness(harness);
    }
  });

  test('saves allowlist from the options page button', async () => {
    const harness = await launchExtensionHarness();

    try {
      await harness.controlPage.locator('textarea').fill('localhost\n*.dev.example.com');
      await harness.controlPage.getByRole('button', { name: 'Save' }).click();

      const state = await sendRuntimeMessage<{
        settings: { allowlist: string[] };
      }>(harness.controlPage, { type: 'get-state' });

      expect(state.settings.allowlist).toEqual(['localhost', '*.dev.example.com']);
    } finally {
      await closeHarness(harness);
    }
  });
});

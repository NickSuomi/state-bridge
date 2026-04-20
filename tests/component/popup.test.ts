// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PopupApp from '../../src/popup/App.vue';

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function findButtonByText(wrapper: ReturnType<typeof mount>, label: string) {
  const match = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim() === label);

  if (match === undefined) {
    throw new Error(`Could not find button "${label}".`);
  }

  return match;
}

describe('PopupApp', () => {
  const sendMessage = vi.fn();
  const openOptionsPage = vi.fn();
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    openOptionsPage.mockReset();
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();

    sendMessage.mockResolvedValueOnce({
      settings: {
        allowlist: ['localhost'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      snapshot: null,
      snapshotSummary: null,
    });

    globalThis.chrome = {
      runtime: {
        sendMessage,
        openOptionsPage,
      },
    } as unknown as typeof chrome;

    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL,
        revokeObjectURL,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures state and opens options from buttons', async () => {
    const wrapper = mount(PopupApp);

    await flushUi();

    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('Storage to copy');
    expect(wrapper.text()).toContain('Import snapshot');
    expect(wrapper.text()).toContain('Export snapshot');
    expect(wrapper.text()).toContain('No snapshot captured');

    sendMessage.mockResolvedValueOnce({
      ok: true,
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
    });
    sendMessage.mockResolvedValueOnce({
      settings: {
        allowlist: ['localhost'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
      snapshotSummary: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        counts: { local: 1, session: 0 },
      },
    });

    await findButtonByText(wrapper, 'Capture').trigger('click');
    await flushUi();

    expect(sendMessage.mock.calls).toContainEqual([
      { type: 'capture', selection: { local: true, session: true }, tabId: undefined },
    ]);
    expect(wrapper.text()).toContain('Captured from prod.example.com.');
    expect(wrapper.text()).toContain('prod.example.com');
    expect(wrapper.text()).toContain('Local storage');
    expect(wrapper.text()).toContain('Session storage');

    await findButtonByText(wrapper, 'Settings').trigger('click');

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('disables export when no snapshot is loaded', async () => {
    const wrapper = mount(PopupApp);

    await flushUi();

    expect(findButtonByText(wrapper, 'Export snapshot').attributes('disabled')).toBeDefined();
  });

  it('imports a snapshot file and refreshes popup state', async () => {
    const wrapper = mount(PopupApp);

    await flushUi();

    sendMessage.mockResolvedValueOnce({
      ok: true,
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
      snapshotSummary: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        counts: { local: 1, session: 0 },
      },
    });
    sendMessage.mockResolvedValueOnce({
      settings: {
        allowlist: ['localhost'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
      snapshotSummary: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        counts: { local: 1, session: 0 },
      },
    });

    const fileInput = wrapper.find('input[type="file"]');
    const file = new File(
      [
        JSON.stringify({
          kind: 'state-bridge-snapshot',
          version: 1,
          exportedAt: '2026-03-24T19:01:00.000Z',
          snapshot: {
            sourceUrl: 'https://prod.example.com',
            capturedAt: '2026-03-24T19:00:00.000Z',
            localStorage: { auth: 'token' },
            sessionStorage: {},
          },
        }),
      ],
      'snapshot.json',
      { type: 'application/json' },
    );

    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });

    await fileInput.trigger('change');
    await flushUi();

    expect(sendMessage.mock.calls).toContainEqual([
      {
        type: 'import-snapshot',
        fileContent: JSON.stringify({
          kind: 'state-bridge-snapshot',
          version: 1,
          exportedAt: '2026-03-24T19:01:00.000Z',
          snapshot: {
            sourceUrl: 'https://prod.example.com',
            capturedAt: '2026-03-24T19:00:00.000Z',
            localStorage: { auth: 'token' },
            sessionStorage: {},
          },
        }),
      },
    ]);
    expect(wrapper.text()).toContain('Imported snapshot from prod.example.com.');
    expect(wrapper.text()).toContain('prod.example.com');
    expect(wrapper.text()).toContain('Local keys1');
  });

  it('shows clear error on invalid import and keeps existing summary', async () => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValueOnce({
      settings: {
        allowlist: ['localhost'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
      snapshotSummary: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        counts: { local: 1, session: 0 },
      },
    });

    const wrapper = mount(PopupApp);

    await flushUi();

    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'invalid_snapshot_file',
        message: 'Snapshot file is not valid JSON.',
      },
    });

    const fileInput = wrapper.find('input[type="file"]');
    const file = new File(['{'], 'broken.json', { type: 'application/json' });

    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });

    await fileInput.trigger('change');
    await flushUi();

    expect(wrapper.text()).toContain('Snapshot file is not valid JSON.');
    expect(wrapper.text()).toContain('prod.example.com');
    expect(wrapper.text()).toContain('Local keys1');
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('shows explicit override action when apply is blocked by the allowlist', async () => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValueOnce({
      settings: {
        allowlist: ['localhost'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      snapshot: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        localStorage: { auth: 'token' },
        sessionStorage: {},
      },
      snapshotSummary: {
        sourceUrl: 'https://prod.example.com',
        capturedAt: '2026-03-24T19:00:00.000Z',
        counts: { local: 1, session: 0 },
      },
    });

    const wrapper = mount(PopupApp);
    await flushUi();

    sendMessage.mockResolvedValueOnce({
      ok: false,
      requiresOverride: true,
      targetUrl: 'http://127.0.0.1:4173/target.html',
      error: {
        code: 'target_not_allowed',
        message: 'Target is outside the allowlist.',
      },
    });

    await findButtonByText(wrapper, 'Apply').trigger('click');
    await flushUi();

    expect(wrapper.text()).toContain('Apply anyway');
    expect(wrapper.text()).toContain('Target is outside the allowlist.');
  });
});

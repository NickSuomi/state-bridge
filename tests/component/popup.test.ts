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

  beforeEach(() => {
    sendMessage.mockReset();
    openOptionsPage.mockReset();

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures state and opens options from buttons', async () => {
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

    await findButtonByText(wrapper, 'Options').trigger('click');

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
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

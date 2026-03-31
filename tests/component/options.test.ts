// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OptionsApp from '../../src/options/App.vue';

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('OptionsApp', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();

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
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves allowlist from the save button', async () => {
    const wrapper = mount(OptionsApp);

    await flushUi();
    await wrapper.find('textarea').setValue('localhost\n*.dev.example.com');
    await flushUi();

    sendMessage.mockResolvedValueOnce({
      ok: true,
      settings: {
        allowlist: ['localhost', '*.dev.example.com'],
        defaultSelection: { local: true, session: true },
        autoReload: true,
      },
      invalidEntries: [],
    });

    await wrapper.find('button').trigger('click');
    await flushUi();

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'save-settings',
      allowlistEntries: ['localhost', '*.dev.example.com'],
    });
    expect(wrapper.text()).toContain('Saved.');
  });
});

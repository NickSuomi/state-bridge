<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { derivePopupState } from '../shared/popup-state';
import type {
  ApplyResult,
  CaptureResult,
  ExtensionState,
  StorageSelection,
} from '../shared/types';
import { parseOptionalTabId, sendRuntimeMessage } from '../ui/runtime';

const selection = ref<StorageSelection>({ local: true, session: true });
const extensionState = ref<ExtensionState | null>(null);
const statusMessage = ref('Ready.');
const statusTone = ref<'neutral' | 'success' | 'error'>('neutral');
const busy = ref(false);
const overrideVisible = ref(false);

const queryParams = new URLSearchParams(window.location.search);
const captureTabId = parseOptionalTabId(queryParams.get('captureTabId'));
const applyTabId = parseOptionalTabId(queryParams.get('applyTabId'));

const popupState = computed(() =>
  extensionState.value === null
    ? { canCapture: false, canApply: false, summaryText: 'Loading…' }
    : derivePopupState(extensionState.value.snapshot, extensionState.value.settings, selection.value),
);

const alertClass = computed(() => {
  if (statusTone.value === 'success') {
    return 'sb-alert sb-alert--success';
  }

  if (statusTone.value === 'error') {
    return 'sb-alert sb-alert--error';
  }

  return 'sb-alert';
});

async function refreshState(): Promise<void> {
  extensionState.value = await sendRuntimeMessage<ExtensionState>({ type: 'get-state' });
  selection.value = { ...extensionState.value.settings.defaultSelection };
}

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  statusMessage.value = message;
  statusTone.value = tone;
}

function buildCaptureMessage() {
  return { type: 'capture' as const, selection: selection.value, tabId: captureTabId };
}

function buildApplyMessage(overrideAllowlist = false) {
  return {
    type: 'apply' as const,
    selection: selection.value,
    overrideAllowlist,
    tabId: applyTabId,
  };
}

async function performCapture(): Promise<void> {
  busy.value = true;
  overrideVisible.value = false;

  try {
    const result = await sendRuntimeMessage<CaptureResult>(buildCaptureMessage());
    if (!result.ok) {
      setStatus(result.error.message, 'error');
      return;
    }

    setStatus(`Captured from ${new URL(result.snapshot.sourceUrl).host}.`, 'success');
    await refreshState();
  } finally {
    busy.value = false;
  }
}

async function performApply(overrideAllowlist = false): Promise<void> {
  busy.value = true;

  try {
    const result = await sendRuntimeMessage<ApplyResult>(buildApplyMessage(overrideAllowlist));

    if (result.ok) {
      overrideVisible.value = false;
      setStatus(`Applied to ${new URL(result.targetUrl).host}.`, 'success');
      return;
    }

    if ('requiresOverride' in result && result.requiresOverride) {
      overrideVisible.value = true;
      setStatus(result.error.message, 'error');
      return;
    }

    setStatus(result.error.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function openOptions(): Promise<void> {
  await chrome.runtime.openOptionsPage();
}

onMounted(async () => {
  await refreshState();
});
</script>

<template>
  <div class="sb-shell sb-panel">
    <div class="sb-frame sb-frame--panel sb-pad">
      <header class="sb-header">
        <div class="sb-brand">
          <img class="sb-brand__mark" src="/brand/bridge-mark.svg" alt="State Bridge mark" />
          <div>
            <h1 class="sb-title">State Bridge</h1>
          </div>
        </div>

        <button class="sb-button sb-button--small sb-button--ghost" type="button" @click="openOptions">
          Options
        </button>
      </header>

      <div class="sb-grid">
        <section class="sb-card sb-pad">
          <p class="sb-card__title">Storage</p>

          <div class="sb-storage-list sb-space-top">
            <label class="sb-toggle">
              <input v-model="selection.local" type="checkbox" />
              <span>
                <span class="sb-toggle__title">localStorage</span>
              </span>
            </label>
            <label class="sb-toggle">
              <input v-model="selection.session" type="checkbox" />
              <span>
                <span class="sb-toggle__title">sessionStorage</span>
              </span>
            </label>
          </div>
        </section>

        <section class="sb-card sb-pad">
          <p class="sb-card__title">Status</p>

          <div class="sb-status-grid sb-space-top">
            <div class="sb-command-row">
              <div class="sb-command-row__meta">
                <span class="sb-command-row__title">Snapshot</span>
                <span class="sb-command-row__hint">{{ popupState.summaryText }}</span>
              </div>
            </div>

            <div :class="alertClass">
              <strong class="sb-alert__title">{{ statusTone === 'error' ? 'Warning' : 'Info' }}</strong>
              <span class="sb-alert__copy">{{ statusMessage }}</span>
            </div>
          </div>
        </section>

        <div class="sb-actions sb-actions--inline">
          <div class="sb-action">
            <button
              class="sb-button sb-button--primary"
              type="button"
              :disabled="busy || !popupState.canCapture"
              @click="performCapture"
            >
              Capture
            </button>
          </div>

          <div class="sb-action">
            <button
              class="sb-button sb-button--ghost"
              type="button"
              :disabled="busy || !popupState.canApply"
              @click="performApply(false)"
            >
              Apply
            </button>
          </div>

          <div v-if="overrideVisible" class="sb-action sb-action--full">
            <button class="sb-button sb-button--danger" type="button" :disabled="busy" @click="performApply(true)">
              Apply anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

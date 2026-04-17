<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { derivePopupState } from '../shared/popup-state';
import type {
  ApplyResult,
  CaptureResult,
  ExtensionState,
  ExportSnapshotResult,
  ImportSnapshotResult,
  StorageSelection,
} from '../shared/types';
import { parseOptionalTabId, sendRuntimeMessage } from '../ui/runtime';

const selection = ref<StorageSelection>({ local: true, session: true });
const extensionState = ref<ExtensionState | null>(null);
const statusMessage = ref('Ready.');
const statusTone = ref<'neutral' | 'success' | 'error'>('neutral');
const busy = ref(false);
const overrideVisible = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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

const canExport = computed(() => extensionState.value !== null && extensionState.value.snapshot !== null);

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

function getDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function downloadSnapshotFile(fileName: string, fileContent: string): void {
  const blob = new Blob([fileContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
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

    setStatus(`Captured from ${getDisplayHost(result.snapshot.sourceUrl)}.`, 'success');
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
      setStatus(`Applied to ${getDisplayHost(result.targetUrl)}.`, 'success');
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

async function performExport(): Promise<void> {
  busy.value = true;

  try {
    const result = await sendRuntimeMessage<ExportSnapshotResult>({ type: 'export-snapshot' });

    if (!result.ok) {
      setStatus(result.error.message, 'error');
      return;
    }

    downloadSnapshotFile(result.fileName, result.fileContent);
    setStatus(`Exported ${result.fileName}.`, 'success');
  } finally {
    busy.value = false;
  }
}

function openImportPicker(): void {
  fileInput.value?.click();
}

async function onFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];

  if (file === undefined) {
    return;
  }

  busy.value = true;
  overrideVisible.value = false;

  try {
    const fileContent = await file.text();
    const result = await sendRuntimeMessage<ImportSnapshotResult>({
      type: 'import-snapshot',
      fileContent,
    });

    if (!result.ok) {
      setStatus(result.error.message, 'error');
      return;
    }

    await refreshState();
    setStatus(`Imported snapshot from ${getDisplayHost(result.snapshot.sourceUrl)}.`, 'success');
  } finally {
    if (target !== null) {
      target.value = '';
    }
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
        <h1 class="sb-title">State Bridge</h1>

        <button class="sb-button sb-button--small sb-button--ghost" type="button" @click="openOptions">
          Options
        </button>
      </header>

      <div class="sb-grid">
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="sb-visually-hidden"
          @change="onFileSelected"
        />

        <section class="sb-card sb-card--compact sb-pad">
          <div class="sb-section-head">
            <p class="sb-card__title">Snapshot</p>
            <span class="sb-card__meta">{{ popupState.summaryText }}</span>
          </div>

          <div class="sb-space-top">
            <div :class="alertClass">
              <strong class="sb-alert__title">{{ statusTone === 'error' ? 'Warning' : 'Info' }}</strong>
              <span class="sb-alert__copy">{{ statusMessage }}</span>
            </div>
          </div>
        </section>

        <section class="sb-card sb-card--compact sb-pad">
          <div class="sb-section-head">
            <p class="sb-card__title">Storage</p>
          </div>

          <div class="sb-storage-list sb-storage-list--compact sb-space-top">
            <label class="sb-toggle">
              <input v-model="selection.local" type="checkbox" />
              <span class="sb-toggle__title">Local</span>
            </label>
            <label class="sb-toggle">
              <input v-model="selection.session" type="checkbox" />
              <span class="sb-toggle__title">Session</span>
            </label>
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

          <div class="sb-action">
            <button class="sb-button sb-button--ghost" type="button" :disabled="busy || !canExport" @click="performExport">
              Export
            </button>
          </div>

          <div class="sb-action">
            <button class="sb-button sb-button--ghost" type="button" :disabled="busy" @click="openImportPicker">
              Import
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

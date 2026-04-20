<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { derivePopupState } from '../shared/popup-state';
import type {
  ApplyResult,
  CaptureResult,
  ExtensionState,
  ExportSnapshotResult,
  ImportSnapshotResult,
  SnapshotSummary,
  StorageSelection,
} from '../shared/types';
import { parseOptionalTabId, sendRuntimeMessage } from '../ui/runtime';

const selection = ref<StorageSelection>({ local: true, session: true });
const extensionState = ref<ExtensionState | null>(null);
const statusMessage = ref('Ready to capture or apply browser storage.');
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

const snapshotSummary = computed<SnapshotSummary | null>(
  () => extensionState.value?.snapshotSummary ?? null,
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

const statusTitle = computed(() => {
  if (statusTone.value === 'success') {
    return 'Success';
  }

  if (statusTone.value === 'error') {
    return 'Warning';
  }

  return 'Status';
});

const canExport = computed(() => extensionState.value?.snapshot !== null);

const snapshotRows = computed(() => {
  if (snapshotSummary.value === null) {
    return [];
  }

  return [
    {
      label: 'Source host',
      value: getDisplayHost(snapshotSummary.value.sourceUrl),
    },
    {
      label: 'Captured',
      value: formatTimestamp(snapshotSummary.value.capturedAt),
    },
    {
      label: 'Local keys',
      value: String(snapshotSummary.value.counts.local),
    },
    {
      label: 'Session keys',
      value: String(snapshotSummary.value.counts.session),
    },
  ];
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

function getDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
    <div class="sb-frame sb-frame--panel">
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="sb-visually-hidden"
        @change="onFileSelected"
      />

      <header class="sb-header sb-header--panel">
        <div class="sb-heading">
          <p class="sb-eyebrow">Developer extension</p>
          <h1 class="sb-title">State Bridge</h1>
        </div>

        <button class="sb-button sb-button--tertiary sb-button--small" type="button" @click="openOptions">
          Settings
        </button>
      </header>

      <div :class="alertClass" role="status" aria-live="polite">
        <strong class="sb-alert__title">{{ statusTitle }}</strong>
        <span class="sb-alert__copy">{{ statusMessage }}</span>
      </div>

      <section class="sb-card sb-section">
        <div class="sb-card__header">
          <div>
            <p class="sb-card__title">Snapshot</p>
            <p class="sb-card__copy">Most recent captured or imported browser state.</p>
          </div>
        </div>

        <dl v-if="snapshotSummary !== null" class="sb-definition-list">
          <template v-for="row in snapshotRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>

        <p v-else class="sb-empty-copy">{{ popupState.summaryText }}</p>
      </section>

      <section class="sb-card sb-section">
        <div class="sb-card__header">
          <div>
            <p class="sb-card__title">Storage to copy</p>
            <p class="sb-card__copy">Choose which browser storage areas should move with the snapshot.</p>
          </div>
        </div>

        <div class="sb-check-list">
          <label class="sb-check-row">
            <div class="sb-check-row__body">
              <span class="sb-check-row__title">Local storage</span>
              <span class="sb-check-row__copy">Copy persistent `localStorage` keys and values.</span>
            </div>
            <input v-model="selection.local" value="local" type="checkbox" />
          </label>

          <label class="sb-check-row">
            <div class="sb-check-row__body">
              <span class="sb-check-row__title">Session storage</span>
              <span class="sb-check-row__copy">Copy current-tab `sessionStorage` keys and values.</span>
            </div>
            <input v-model="selection.session" value="session" type="checkbox" />
          </label>
        </div>
      </section>

      <section class="sb-actions sb-actions--primary sb-section">
        <button
          class="sb-button sb-button--primary"
          type="button"
          :disabled="busy || !popupState.canCapture"
          @click="performCapture"
        >
          Capture
        </button>

        <button
          class="sb-button sb-button--secondary"
          type="button"
          :disabled="busy || !popupState.canApply"
          @click="performApply(false)"
        >
          Apply
        </button>
      </section>

      <section class="sb-actions sb-actions--secondary">
        <button
          class="sb-button sb-button--tertiary"
          type="button"
          :disabled="busy"
          @click="openImportPicker"
        >
          Import snapshot
        </button>

        <button
          class="sb-button sb-button--tertiary"
          type="button"
          :disabled="busy || !canExport"
          @click="performExport"
        >
          Export snapshot
        </button>
      </section>

      <section v-if="overrideVisible" class="sb-actions sb-section">
        <button class="sb-button sb-button--danger" type="button" :disabled="busy" @click="performApply(true)">
          Apply anyway
        </button>
      </section>
    </div>
  </div>
</template>

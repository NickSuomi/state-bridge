<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { ExtensionState, SaveSettingsResult, StorageSelection } from '../shared/types';
import { sendRuntimeMessage } from '../ui/runtime';

const allowlistText = ref('');
const defaultSelection = ref<StorageSelection>({ local: true, session: true });
const autoReload = ref(true);
const busy = ref(false);
const statusMessage = ref('Review safety and default apply behavior before saving.');
const statusTone = ref<'neutral' | 'success' | 'error'>('neutral');

const alertClass = computed(() => {
  if (statusTone.value === 'error') {
    return 'sb-alert sb-alert--error';
  }

  if (statusTone.value === 'success') {
    return 'sb-alert sb-alert--success';
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

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  statusMessage.value = message;
  statusTone.value = tone;
}

async function loadState(): Promise<void> {
  const state = await sendRuntimeMessage<ExtensionState>({ type: 'get-state' });
  allowlistText.value = state.settings.allowlist.join('\n');
  defaultSelection.value = { ...state.settings.defaultSelection };
  autoReload.value = state.settings.autoReload;
}

async function saveSettings(): Promise<void> {
  busy.value = true;

  try {
    const result = await sendRuntimeMessage<SaveSettingsResult>({
      type: 'save-settings',
      allowlistEntries: allowlistText.value.split('\n'),
      defaultSelection: defaultSelection.value,
      autoReload: autoReload.value,
    });

    allowlistText.value = result.settings.allowlist.join('\n');
    defaultSelection.value = { ...result.settings.defaultSelection };
    autoReload.value = result.settings.autoReload;

    if (result.invalidEntries.length > 0) {
      setStatus(`Saved, but ignored invalid entries: ${result.invalidEntries.join(', ')}`, 'error');
      return;
    }

    setStatus('Changes saved.', 'success');
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadState();
});
</script>

<template>
  <div class="sb-shell sb-page">
    <div class="sb-workbench sb-workbench--narrow">
      <div class="sb-frame sb-frame--page">
        <header class="sb-header sb-header--page">
          <div class="sb-heading">
            <p class="sb-eyebrow">State Bridge</p>
            <h1 class="sb-title sb-title--page">Settings</h1>
            <p class="sb-page-copy">
              Keep apply targets safe, choose default storage capture behavior, and control target reloads.
            </p>
          </div>
        </header>

        <section class="sb-card sb-section">
          <div class="sb-card__header">
            <div>
              <p class="sb-card__title">Target allowlist</p>
              <p class="sb-card__copy">One hostname, wildcard host, or full origin per line.</p>
            </div>
          </div>

          <textarea
            v-model="allowlistText"
            class="sb-textarea"
            rows="8"
            placeholder="localhost&#10;127.0.0.1&#10;*.dev.example.com"
          />

          <p class="sb-help-text">
            Examples: `localhost`, `*.local`, or `https://staging.example.com`
          </p>
        </section>

        <section class="sb-card sb-section">
          <div class="sb-card__header">
            <div>
              <p class="sb-card__title">Default capture selection</p>
              <p class="sb-card__copy">These defaults are preselected each time the popup refreshes.</p>
            </div>
          </div>

          <div class="sb-check-list">
            <label class="sb-check-row">
              <div class="sb-check-row__body">
                <span class="sb-check-row__title">Local storage</span>
                <span class="sb-check-row__copy">Preselect persistent application state.</span>
              </div>
              <input v-model="defaultSelection.local" value="local" type="checkbox" />
            </label>

            <label class="sb-check-row">
              <div class="sb-check-row__body">
                <span class="sb-check-row__title">Session storage</span>
                <span class="sb-check-row__copy">Preselect current-tab session state.</span>
              </div>
              <input v-model="defaultSelection.session" value="session" type="checkbox" />
            </label>
          </div>
        </section>

        <section class="sb-card sb-section">
          <div class="sb-card__header">
            <div>
              <p class="sb-card__title">Apply behavior</p>
              <p class="sb-card__copy">Choose what should happen immediately after a successful apply.</p>
            </div>
          </div>

          <label class="sb-toggle-row">
            <div class="sb-check-row__body">
              <span class="sb-check-row__title">Reload target tab after apply</span>
              <span class="sb-check-row__copy">Refresh the target automatically so restored state takes effect.</span>
            </div>
            <input v-model="autoReload" data-setting="auto-reload" type="checkbox" />
          </label>
        </section>

        <div :class="alertClass" role="status" aria-live="polite">
          <strong class="sb-alert__title">{{ statusTitle }}</strong>
          <span class="sb-alert__copy">{{ statusMessage }}</span>
        </div>

        <div class="sb-actions sb-actions--footer sb-section">
          <button class="sb-button sb-button--primary" type="button" :disabled="busy" @click="saveSettings">
            Save changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

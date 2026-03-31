<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { ExtensionState, SaveSettingsResult } from '../shared/types';
import { sendRuntimeMessage } from '../ui/runtime';

const allowlistText = ref('');
const busy = ref(false);
const statusMessage = ref('Ready.');
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

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  statusMessage.value = message;
  statusTone.value = tone;
}

async function loadState(): Promise<void> {
  const state = await sendRuntimeMessage<ExtensionState>({ type: 'get-state' });
  allowlistText.value = state.settings.allowlist.join('\n');
}

async function saveAllowlist(): Promise<void> {
  busy.value = true;

  try {
    const result = await sendRuntimeMessage<SaveSettingsResult>({
      type: 'save-settings',
      allowlistEntries: allowlistText.value.split('\n'),
    });

    allowlistText.value = result.settings.allowlist.join('\n');
    if (result.invalidEntries.length > 0) {
      setStatus(`Ignored invalid entries: ${result.invalidEntries.join(', ')}`, 'error');
      return;
    }

    setStatus('Saved.', 'success');
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
        <header class="sb-header">
          <div class="sb-brand">
            <img class="sb-brand__mark" src="/brand/bridge-mark.svg" alt="State Bridge mark" />
            <div>
              <h1 class="sb-title">State Bridge</h1>
            </div>
          </div>
        </header>

        <section class="sb-card sb-pad">
          <p class="sb-card__title">Allowlist</p>
          <p class="sb-card__copy">One rule per line.</p>

          <textarea
            v-model="allowlistText"
            class="sb-textarea sb-space-top"
            rows="12"
            placeholder="localhost&#10;127.0.0.1&#10;*.dev.example.com"
          />

          <div class="sb-space-top">
            <button class="sb-button sb-button--primary sb-button--small" type="button" :disabled="busy" @click="saveAllowlist">
              Save
            </button>
          </div>
        </section>

        <div class="sb-space-top" :class="alertClass">
          <strong class="sb-alert__title">Status</strong>
          <span class="sb-alert__copy">{{ statusMessage }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

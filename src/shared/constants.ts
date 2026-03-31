import type { Settings } from './types';

export const STORAGE_KEYS = {
  snapshot: 'stateBridge.snapshot',
  settings: 'stateBridge.settings',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  allowlist: ['localhost', '127.0.0.1', '*.local'],
  defaultSelection: {
    local: true,
    session: true,
  },
  autoReload: true,
};

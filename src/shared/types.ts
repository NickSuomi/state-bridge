export type StorageAreaName = 'local' | 'session';

export interface StorageSelection {
  local: boolean;
  session: boolean;
}

export interface StorageAreaSnapshot {
  [key: string]: string;
}

export interface Snapshot {
  sourceUrl: string;
  capturedAt: string;
  localStorage: StorageAreaSnapshot;
  sessionStorage: StorageAreaSnapshot;
}

export interface SharedSnapshotFile {
  kind: 'state-bridge-snapshot';
  version: 1;
  exportedAt: string;
  snapshot: Snapshot;
}

export interface Settings {
  allowlist: string[];
  defaultSelection: StorageSelection;
  autoReload: boolean;
}

export interface SnapshotSummary {
  sourceUrl: string;
  capturedAt: string;
  counts: {
    local: number;
    session: number;
  };
}

export type ErrorCode =
  | 'nothing_selected'
  | 'no_snapshot'
  | 'tab_not_found'
  | 'capture_failed'
  | 'apply_failed'
  | 'target_not_allowed'
  | 'invalid_snapshot_file'
  | 'unsupported_snapshot_version'
  | 'settings_invalid';

export interface OperationError {
  code: ErrorCode;
  message: string;
}

export interface CaptureSuccess {
  ok: true;
  snapshot: Snapshot;
}

export interface ApplySuccess {
  ok: true;
  targetUrl: string;
  reloaded: boolean;
}

export interface WarningResult {
  ok: false;
  error: OperationError;
  targetUrl: string;
  requiresOverride: true;
}

export interface FailureResult {
  ok: false;
  error: OperationError;
}

export type CaptureResult = CaptureSuccess | FailureResult;
export type ApplyResult = ApplySuccess | WarningResult | FailureResult;

export interface SaveSettingsResult {
  ok: true;
  settings: Settings;
  invalidEntries: string[];
}

export interface ExportSnapshotSuccess {
  ok: true;
  fileName: string;
  fileContent: string;
}

export type ExportSnapshotResult = ExportSnapshotSuccess | FailureResult;

export interface ImportSnapshotSuccess {
  ok: true;
  snapshot: Snapshot;
  snapshotSummary: SnapshotSummary;
}

export type ImportSnapshotResult = ImportSnapshotSuccess | FailureResult;

export interface ExtensionState {
  settings: Settings;
  snapshot: Snapshot | null;
  snapshotSummary: SnapshotSummary | null;
}

export type RuntimeMessage =
  | { type: 'get-state' }
  | { type: 'capture'; selection: StorageSelection; tabId?: number }
  | { type: 'apply'; selection: StorageSelection; overrideAllowlist?: boolean; tabId?: number }
  | { type: 'export-snapshot' }
  | { type: 'import-snapshot'; fileContent: string }
  | { type: 'save-settings'; allowlistEntries: string[] };

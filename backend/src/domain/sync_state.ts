export type SyncStatus = 'success' | 'failed';

export interface SyncState {
  id: 1;
  sync_version: number;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_status: SyncStatus | null;
}

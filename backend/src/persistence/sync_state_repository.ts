import { SyncState, SyncStatus } from '../domain/sync_state.js';
import { getCurrentIsoTimestamp } from './d1_database.js';

export interface SyncStateRow {
  id: number;
  sync_version: number;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_status: string | null;
}

export function mapSyncStateRow(row: SyncStateRow): SyncState {
  return {
    id: 1,
    sync_version: Number(row.sync_version),
    last_sync_started_at: row.last_sync_started_at,
    last_sync_completed_at: row.last_sync_completed_at,
    last_sync_status: (row.last_sync_status as SyncStatus) ?? null,
  };
}

export class D1SyncStateRepository {
  constructor(private readonly db: D1Database) {}

  prepareGet(): D1PreparedStatement {
    return this.db.prepare('SELECT * FROM sync_state WHERE id = 1');
  }

  async get(): Promise<SyncState> {
    let row = await this.db
      .prepare('SELECT * FROM sync_state WHERE id = 1')
      .first<SyncStateRow>();

    if (!row) {
      // Self-heal initial singleton if missing
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO sync_state (id, sync_version, last_sync_started_at, last_sync_completed_at, last_sync_status)
           VALUES (1, 0, NULL, NULL, NULL)`
        )
        .run();

      row = await this.db
        .prepare('SELECT * FROM sync_state WHERE id = 1')
        .first<SyncStateRow>();
    }

    if (!row) {
      throw new Error('sync_state singleton row could not be retrieved');
    }

    return mapSyncStateRow(row);
  }

  prepareIncrementVersion(): D1PreparedStatement {
    return this.db.prepare(
      'UPDATE sync_state SET sync_version = sync_version + 1 WHERE id = 1 RETURNING sync_version'
    );
  }

  async incrementVersion(): Promise<number> {
    const row = await this.prepareIncrementVersion().first<{ sync_version: number }>();
    if (!row) {
      throw new Error('Failed to increment sync_version');
    }
    return Number(row.sync_version);
  }

  prepareUpdateSyncCompletion(
    status: SyncStatus,
    startedAt: string | null = null,
    completedAt: string = getCurrentIsoTimestamp()
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE sync_state
         SET last_sync_status = ?,
             last_sync_started_at = COALESCE(?, last_sync_started_at),
             last_sync_completed_at = ?
         WHERE id = 1`
      )
      .bind(status, startedAt, completedAt);
  }

  async updateSyncCompletion(
    status: SyncStatus,
    startedAt: string | null = null,
    completedAt: string = getCurrentIsoTimestamp()
  ): Promise<void> {
    await this.prepareUpdateSyncCompletion(status, startedAt, completedAt).run();
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockD1Database, loadInitialMigrationSql } from './d1_test_helper.js';

describe('D1 Migration 0001_initial.sql', () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockD1Database(loadInitialMigrationSql());
  });

  it('should create sync_state with initial singleton row', async () => {
    const row = await db.prepare('SELECT * FROM sync_state WHERE id = 1').first<{
      id: number;
      sync_version: number;
      last_sync_started_at: string | null;
      last_sync_completed_at: string | null;
      last_sync_status: string | null;
    }>();

    expect(row).toBeDefined();
    expect(row?.id).toBe(1);
    expect(row?.sync_version).toBe(0);
    expect(row?.last_sync_started_at).toBeNull();
    expect(row?.last_sync_completed_at).toBeNull();
    expect(row?.last_sync_status).toBeNull();
  });

  it('should enforce sync_state id = 1 CHECK constraint', async () => {
    await expect(
      db
        .prepare('INSERT INTO sync_state (id, sync_version) VALUES (2, 0)')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce sync_state sync_version >= 0 CHECK constraint', async () => {
    await expect(
      db
        .prepare('UPDATE sync_state SET sync_version = -1 WHERE id = 1')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce foreign key constraint from tracks to songs', async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO tracks (song_id, relative_path, created_at, updated_at) VALUES (999, 'Test.mp3', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')"
        )
        .run()
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

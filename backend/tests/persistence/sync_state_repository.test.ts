import { describe, it, expect, beforeEach } from 'vitest';
import { createMockD1Database, loadInitialMigrationSql } from './d1_test_helper.js';
import { D1SyncStateRepository } from '../../src/persistence/sync_state_repository.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { VersionType } from '../../src/domain/version_type.js';

describe('D1SyncStateRepository & Batch Atomicity', () => {
  let db: D1Database;
  let syncRepo: D1SyncStateRepository;
  let songRepo: D1SongRepository;

  beforeEach(() => {
    db = createMockD1Database(loadInitialMigrationSql());
    syncRepo = new D1SyncStateRepository(db);
    songRepo = new D1SongRepository(db);
  });

  it('should retrieve initial singleton sync_state with version 0', async () => {
    const state = await syncRepo.get();
    expect(state.id).toBe(1);
    expect(state.sync_version).toBe(0);
    expect(state.last_sync_status).toBeNull();
  });

  it('should monotonically increment sync_version', async () => {
    const v1 = await syncRepo.incrementVersion();
    expect(v1).toBe(1);

    const v2 = await syncRepo.incrementVersion();
    expect(v2).toBe(2);

    const state = await syncRepo.get();
    expect(state.sync_version).toBe(2);
  });

  it('should update sync completion metadata', async () => {
    const started = '2026-09-09T01:00:00.000Z';
    const completed = '2026-09-09T01:05:00.000Z';

    await syncRepo.updateSyncCompletion('success', started, completed);

    const state = await syncRepo.get();
    expect(state.last_sync_status).toBe('success');
    expect(state.last_sync_started_at).toBe(started);
    expect(state.last_sync_completed_at).toBe(completed);
  });

  it('should atomically commit song addition and sync_version increment via db.batch()', async () => {
    const insertStmt = songRepo.prepareInsert({
      artist: 'Led Zeppelin',
      title: 'Stairway to Heaven',
      normalized_artist: 'led zeppelin',
      normalized_title: 'stairway to heaven',
      version_type: VersionType.STANDARD,
    });
    const incStmt = syncRepo.prepareIncrementVersion();

    await db.batch([insertStmt, incStmt]);

    const song = await songRepo.findByIdentity(
      'led zeppelin',
      'stairway to heaven',
      VersionType.STANDARD
    );
    expect(song).toBeDefined();

    const state = await syncRepo.get();
    expect(state.sync_version).toBe(1);
  });

  it('should atomically ROLL BACK batch on failure, leaving sync_version untouched', async () => {
    // 1. First add a song so its identity is occupied
    await songRepo.insert({
      artist: 'Queen',
      title: 'Under Pressure',
      normalized_artist: 'queen',
      normalized_title: 'under pressure',
      version_type: VersionType.STANDARD,
    });
    const stateBefore = await syncRepo.get();
    expect(stateBefore.sync_version).toBe(0);

    // 2. Prepare a duplicate insert statement (which will trigger UNIQUE constraint error)
    // combined with an incrementVersion statement in the same batch
    const duplicateInsertStmt = songRepo.prepareInsert({
      artist: 'Queen',
      title: 'Under Pressure',
      normalized_artist: 'queen',
      normalized_title: 'under pressure',
      version_type: VersionType.STANDARD,
    });
    const incStmt = syncRepo.prepareIncrementVersion();

    // The batch execution must fail and roll back
    await expect(db.batch([duplicateInsertStmt, incStmt])).rejects.toThrow();

    // 3. Verify sync_version was NOT incremented (rolled back)
    const stateAfter = await syncRepo.get();
    expect(stateAfter.sync_version).toBe(0);
  });
});

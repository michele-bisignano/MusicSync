import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryD1Database } from '../persistence/d1_test_helper.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { D1SyncStateRepository } from '../../src/persistence/sync_state_repository.js';
import { LibraryService } from '../../src/library/library_service.js';
import { VersionType } from '../../src/domain/version_type.js';
import { SongStatus } from '../../src/domain/song.js';

describe('LibraryService Integration', () => {
  let db: D1Database;
  let songRepo: D1SongRepository;
  let syncRepo: D1SyncStateRepository;
  let service: LibraryService;

  beforeEach(async () => {
    db = await createInMemoryD1Database();
    songRepo = new D1SongRepository(db);
    syncRepo = new D1SyncStateRepository(db);
    service = new LibraryService(db, songRepo, syncRepo);
  });

  it('adds a new song and atomically increments sync_version', async () => {
    const res = await service.addSong({
      artist: 'Pink Floyd',
      title: 'Time',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=11111111111',
    });

    expect(res.status).toBe('added');
    expect(res.song.artist).toBe('Pink Floyd');
    expect(res.song.title).toBe('Time');
    expect(res.song.status).toBe(SongStatus.ACTIVE);
    expect(res.sync_version).toBe(1);

    const active = await service.listActiveSongs();
    expect(active.length).toBe(1);
  });

  it('detects duplicate active song and does not increment sync_version', async () => {
    const first = await service.addSong({
      artist: 'The Beatles',
      title: 'Let It Be',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=22222222222',
    });
    expect(first.sync_version).toBe(1);

    const second = await service.addSong({
      artist: 'the beatles',
      title: 'let it be',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=22222222222',
    });

    expect(second.status).toBe('already_active');
    expect(second.sync_version).toBe(1); // Not incremented

    const active = await service.listActiveSongs();
    expect(active.length).toBe(1);
  });

  it('logically reactivates a removed song and increments sync_version', async () => {
    const added = await service.addSong({
      artist: 'Queen',
      title: 'Radio Ga Ga',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=33333333333',
    });
    expect(added.sync_version).toBe(1);

    const removed = await service.removeSong(added.song.id);
    expect(removed.success).toBe(true);
    expect(removed.sync_version).toBe(2);

    // Active list should now be empty
    expect((await service.listActiveSongs()).length).toBe(0);

    // Re-adding the song triggers logical reactivation
    const reactivated = await service.addSong({
      artist: 'Queen',
      title: 'Radio Ga Ga',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=44444444444', // New URL
    });

    expect(reactivated.status).toBe('reactivated');
    expect(reactivated.song.id).toBe(added.song.id);
    expect(reactivated.song.status).toBe(SongStatus.ACTIVE);
    expect(reactivated.song.youtube_url).toBe('https://www.youtube.com/watch?v=44444444444');
    expect(reactivated.sync_version).toBe(3);

    const active = await service.listActiveSongs();
    expect(active.length).toBe(1);
  });

  it('forces addition of a new URL to an existing active song (/force)', async () => {
    const initial = await service.addSong({
      artist: 'Coldplay',
      title: 'Yellow',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=55555555555',
    });
    expect(initial.sync_version).toBe(1);

    const forced = await service.forceAddSong({
      artist: 'Coldplay',
      title: 'Yellow',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=66666666666',
    });

    expect(forced.status).toBe('updated');
    expect(forced.song.id).toBe(initial.song.id);
    expect(forced.song.youtube_url).toBe('https://www.youtube.com/watch?v=66666666666');
    expect(forced.sync_version).toBe(2);
  });
});

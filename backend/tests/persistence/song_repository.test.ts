import { describe, it, expect, beforeEach } from 'vitest';
import { createMockD1Database, loadInitialMigrationSql } from './d1_test_helper.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { VersionType } from '../../src/domain/version_type.js';
import { SongStatus } from '../../src/domain/song.js';

describe('D1SongRepository', () => {
  let db: D1Database;
  let repo: D1SongRepository;

  beforeEach(() => {
    db = createMockD1Database(loadInitialMigrationSql());
    repo = new D1SongRepository(db);
  });

  it('should insert a new song and retrieve it by id and identity', async () => {
    const song = await repo.insert({
      artist: 'Pink Floyd',
      title: 'Time',
      normalized_artist: 'pink floyd',
      normalized_title: 'time',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=rL3AgkwbYgo',
    });

    expect(song.id).toBeGreaterThan(0);
    expect(song.artist).toBe('Pink Floyd');
    expect(song.title).toBe('Time');
    expect(song.status).toBe(SongStatus.ACTIVE);
    expect(song.version_type).toBe(VersionType.STANDARD);
    expect(song.youtube_url).toBe('https://www.youtube.com/watch?v=rL3AgkwbYgo');

    const byId = await repo.findById(song.id);
    expect(byId).toEqual(song);

    const byIdentity = await repo.findByIdentity('pink floyd', 'time', VersionType.STANDARD);
    expect(byIdentity).toEqual(song);
  });

  it('should allow multiple songs with NULL youtube_url', async () => {
    const song1 = await repo.insert({
      artist: 'Queen',
      title: 'Bohemian Rhapsody',
      normalized_artist: 'queen',
      normalized_title: 'bohemian rhapsody',
      version_type: VersionType.STANDARD,
      youtube_url: null,
    });

    const song2 = await repo.insert({
      artist: 'Queen',
      title: 'Radio Ga Ga',
      normalized_artist: 'queen',
      normalized_title: 'radio ga ga',
      version_type: VersionType.STANDARD,
      youtube_url: null,
    });

    expect(song1.id).not.toBe(song2.id);
    expect(song1.youtube_url).toBeNull();
    expect(song2.youtube_url).toBeNull();
  });

  it('should enforce unique constraint on non-null youtube_url', async () => {
    const sharedUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    await repo.insert({
      artist: 'Artist One',
      title: 'Song One',
      normalized_artist: 'artist one',
      normalized_title: 'song one',
      version_type: VersionType.STANDARD,
      youtube_url: sharedUrl,
    });

    await expect(
      repo.insert({
        artist: 'Artist Two',
        title: 'Song Two',
        normalized_artist: 'artist two',
        normalized_title: 'song two',
        version_type: VersionType.STANDARD,
        youtube_url: sharedUrl,
      })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('should enforce logical identity uniqueness (normalized_artist, normalized_title, version_type)', async () => {
    await repo.insert({
      artist: 'The Beatles',
      title: 'Let It Be',
      normalized_artist: 'the beatles',
      normalized_title: 'let it be',
      version_type: VersionType.STANDARD,
    });

    // Same normalized identity with STANDARD version should fail
    await expect(
      repo.insert({
        artist: 'The Beatles',
        title: 'Let It Be',
        normalized_artist: 'the beatles',
        normalized_title: 'let it be',
        version_type: VersionType.STANDARD,
      })
    ).rejects.toThrow(/UNIQUE constraint failed/i);

    // Same song with ACOUSTIC version should succeed (distinct identity)
    const acoustic = await repo.insert({
      artist: 'The Beatles',
      title: 'Let It Be',
      normalized_artist: 'the beatles',
      normalized_title: 'let it be',
      version_type: VersionType.ACOUSTIC,
    });
    expect(acoustic.version_type).toBe(VersionType.ACOUSTIC);
  });

  it('should perform logical UPSERT / reactivation on soft-deleted songs', async () => {
    // 1. Insert active song
    const song = await repo.insert({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
      normalized_artist: 'nirvana',
      normalized_title: 'smells like teen spirit',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=hTWKbfoikeg',
    });

    // 2. Soft delete it
    const deleted = await repo.softDelete(song.id);
    expect(deleted).toBe(true);

    const softDeletedSong = await repo.findById(song.id);
    expect(softDeletedSong?.status).toBe(SongStatus.REMOVED);

    // 3. Re-add the song via upsertOrReactivate with a new URL
    const newUrl = 'https://www.youtube.com/watch?v=newVersion';
    const result = await repo.upsertOrReactivate({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
      normalized_artist: 'nirvana',
      normalized_title: 'smells like teen spirit',
      version_type: VersionType.STANDARD,
      youtube_url: newUrl,
    });

    expect(result.wasExisting).toBe(true);
    expect(result.reactivated).toBe(true);
    expect(result.song.id).toBe(song.id);
    expect(result.song.status).toBe(SongStatus.ACTIVE);
    expect(result.song.youtube_url).toBe(newUrl);

    // 4. Calling upsertOrReactivate on an already active song returns it without changes
    const resultActive = await repo.upsertOrReactivate({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
      normalized_artist: 'nirvana',
      normalized_title: 'smells like teen spirit',
      version_type: VersionType.STANDARD,
    });

    expect(resultActive.wasExisting).toBe(true);
    expect(resultActive.reactivated).toBe(false);
  });

  it('should list only active songs in listActive', async () => {
    const s1 = await repo.insert({
      artist: 'Blink-182',
      title: 'All The Small Things',
      normalized_artist: 'blink-182',
      normalized_title: 'all the small things',
      version_type: VersionType.STANDARD,
    });

    const s2 = await repo.insert({
      artist: 'AC/DC',
      title: 'Back in Black',
      normalized_artist: 'ac/dc',
      normalized_title: 'back in black',
      version_type: VersionType.STANDARD,
    });

    await repo.softDelete(s1.id);

    const activeList = await repo.listActive();
    expect(activeList).toHaveLength(1);
    expect(activeList[0].id).toBe(s2.id);
    expect(activeList[0].artist).toBe('AC/DC');
  });
});

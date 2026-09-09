import { describe, it, expect, beforeEach } from 'vitest';
import { createMockD1Database, loadInitialMigrationSql } from './d1_test_helper.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { D1TrackRepository } from '../../src/persistence/track_repository.js';
import { VersionType } from '../../src/domain/version_type.js';

describe('D1TrackRepository', () => {
  let db: D1Database;
  let songRepo: D1SongRepository;
  let trackRepo: D1TrackRepository;
  let songId: number;

  beforeEach(async () => {
    db = createMockD1Database(loadInitialMigrationSql());
    songRepo = new D1SongRepository(db);
    trackRepo = new D1TrackRepository(db);

    const song = await songRepo.insert({
      artist: 'Daft Punk',
      title: 'Get Lucky',
      normalized_artist: 'daft punk',
      normalized_title: 'get lucky',
      version_type: VersionType.STANDARD,
    });
    songId = song.id;
  });

  it('should insert and retrieve a track by relative_path and song_id', async () => {
    const track = await trackRepo.insert(songId, 'Daft Punk - Get Lucky.mp3');

    expect(track.id).toBeGreaterThan(0);
    expect(track.song_id).toBe(songId);
    expect(track.relative_path).toBe('Daft Punk - Get Lucky.mp3');

    const byPath = await trackRepo.findByRelativePath('Daft Punk - Get Lucky.mp3');
    expect(byPath).toEqual(track);

    const bySong = await trackRepo.findBySongId(songId);
    expect(bySong).toEqual(track);
  });

  it('should enforce unique constraint on relative_path', async () => {
    const song2 = await songRepo.insert({
      artist: 'Daft Punk',
      title: 'One More Time',
      normalized_artist: 'daft punk',
      normalized_title: 'one more time',
      version_type: VersionType.STANDARD,
    });

    await trackRepo.insert(songId, 'Daft Punk/Track.mp3');

    await expect(
      trackRepo.insert(song2.id, 'Daft Punk/Track.mp3')
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('should enforce unique constraint on song_id (1 managed physical track per song)', async () => {
    await trackRepo.insert(songId, 'Track1.mp3');

    await expect(
      trackRepo.insert(songId, 'Track2.mp3')
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('should enforce ON DELETE RESTRICT on parent song', async () => {
    await trackRepo.insert(songId, 'ProtectedTrack.mp3');

    // Hard deleting the song while track exists must fail
    await expect(
      db.prepare('DELETE FROM songs WHERE id = ?').bind(songId).run()
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('should delete track by id and by song_id', async () => {
    const track = await trackRepo.insert(songId, 'ToDelete.mp3');

    const deleted = await trackRepo.delete(track.id);
    expect(deleted).toBe(true);

    const found = await trackRepo.findById(track.id);
    expect(found).toBeNull();
  });
});

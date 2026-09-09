import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService, SyncValidationError, SyncConflictError, formatDefaultRelativePath, sanitizeFilenamePart } from '../../src/sync/sync_service.js';
import { createInMemoryD1Database } from '../persistence/d1_test_helper.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { D1TrackRepository } from '../../src/persistence/track_repository.js';
import { D1SyncStateRepository } from '../../src/persistence/sync_state_repository.js';
import { VersionType } from '../../src/domain/version_type.js';
import { SongStatus } from '../../src/domain/song.js';

describe('SyncService', () => {
  let db: any;
  let service: SyncService;
  let songRepo: D1SongRepository;
  let trackRepo: D1TrackRepository;
  let syncStateRepo: D1SyncStateRepository;

  beforeEach(async () => {
    db = await createInMemoryD1Database();
    songRepo = new D1SongRepository(db);
    trackRepo = new D1TrackRepository(db);
    syncStateRepo = new D1SyncStateRepository(db);
    service = new SyncService(db, songRepo, trackRepo, syncStateRepo);
  });

  describe('sanitizeFilenamePart', () => {
    it('removes illegal characters', () => {
      expect(sanitizeFilenamePart('file<name>:"/\\|?*')).toBe('file name');
    });
  });

  describe('formatDefaultRelativePath', () => {
    it('formats standard song', () => {
      expect(formatDefaultRelativePath('Daft Punk', 'Get Lucky')).toBe('Daft Punk - Get Lucky.mp3');
    });

    it('adds version suffix if not standard and not in title', () => {
      expect(formatDefaultRelativePath('Queen', 'We Will Rock You', VersionType.LIVE)).toBe('Queen - We Will Rock You (Live).mp3');
    });

    it('does not add suffix if already in title', () => {
      expect(formatDefaultRelativePath('Queen', 'We Will Rock You (Live)', VersionType.LIVE)).toBe('Queen - We Will Rock You (Live).mp3');
    });
  });

  describe('getSyncState', () => {
    it('returns empty lists for initial DB', async () => {
      const state = await service.getSyncState();
      expect(state.sync_version).toBe(0);
      expect(state.desired_tracks).toHaveLength(0);
      expect(state.obsolete_tracks).toHaveLength(0);
    });

    it('returns desired tracks with correct paths', async () => {
      const song = await songRepo.insert({
        artist: 'Test Artist',
        title: 'Test Song',
        normalized_artist: 'testartist',
        normalized_title: 'testsong',
        version_type: VersionType.STANDARD,
        youtube_url: null,
      }, '2023-01-01T00:00:00Z');

      await trackRepo.insert(song.id, 'Test Artist - Test Song.mp3', '2023-01-01T00:00:00Z');

      const state = await service.getSyncState();
      expect(state.desired_tracks).toHaveLength(1);
      expect(state.desired_tracks[0].song_id).toBe(song.id);
      expect(state.desired_tracks[0].relative_path).toBe('Test Artist - Test Song.mp3');
    });
  });

  describe('processReport', () => {
    it('throws on invalid report type', async () => {
      await expect(service.processReport(null)).rejects.toThrow(SyncValidationError);
      await expect(service.processReport("invalid")).rejects.toThrow(SyncValidationError);
    });

    it('throws on invalid sync_version', async () => {
      await expect(service.processReport({ sync_version: -1, status: 'success', operations: [] })).rejects.toThrow(SyncValidationError);
    });

    it('throws on version conflict', async () => {
      await expect(service.processReport({ sync_version: 1, status: 'success', operations: [] })).rejects.toThrow(SyncConflictError);
    });

    it('processes empty success report', async () => {
      const res = await service.processReport({ sync_version: 0, status: 'success', operations: [] });
      expect(res.acknowledged).toBe(true);
      expect(res.sync_version).toBe(0);
    });

    it('processes valid download report', async () => {
      const song = await songRepo.insert({
        artist: 'A', title: 'T', normalized_artist: 'a', normalized_title: 't', version_type: VersionType.STANDARD, youtube_url: null
      }, '2023-01-01T00:00:00Z');

      const res = await service.processReport({
        sync_version: 0,
        status: 'success',
        operations: [
          { type: 'download', song_id: song.id, relative_path: 'A - T.mp3' }
        ]
      });

      expect(res.summary.tracks_confirmed).toBe(1);
      const track = await trackRepo.findBySongId(song.id);
      expect(track?.relative_path).toBe('A - T.mp3');
    });

    it('processes valid import report', async () => {
      const res = await service.processReport({
        sync_version: 0,
        status: 'success',
        operations: [
          {
            type: 'import',
            song: { artist: 'ImpA', title: 'ImpT' },
            relative_path: 'ImpA - ImpT.mp3'
          }
        ]
      });

      expect(res.summary.songs_imported).toBe(1);
      expect(res.sync_version).toBe(1);

      const songs = await songRepo.listAll();
      expect(songs).toHaveLength(1);
      expect(songs[0].artist).toBe('ImpA');

      const tracks = await trackRepo.listAll();
      expect(tracks).toHaveLength(1);
      expect(tracks[0].relative_path).toBe('ImpA - ImpT.mp3');
    });
  });
});

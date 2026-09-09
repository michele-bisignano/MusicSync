import { SongStatus } from '../domain/song.js';
import { VersionType, parseVersionType } from '../domain/version_type.js';
import {
  detectVersionType,
  normalizeString,
  stripVideoClutter,
} from '../domain/normalization.js';
import { D1SongRepository } from '../persistence/song_repository.js';
import { D1TrackRepository } from '../persistence/track_repository.js';
import { D1SyncStateRepository } from '../persistence/sync_state_repository.js';
import { getCurrentIsoTimestamp } from '../persistence/d1_database.js';
import { SyncStatus } from '../domain/sync_state.js';
import {
  DesiredTrackDto,
  ObsoleteTrackDto,
  SyncReportRequest,
  SyncReportResponse,
  SyncStateResponse,
} from './sync_types.js';

export class SyncValidationError extends Error {
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'SyncValidationError';
  }
}

export class SyncConflictError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'SyncConflictError';
  }
}

/**
 * Sanitizes a string to be safely used as a filename component on Windows/cross-platform systems.
 * Removes characters illegal in Windows filenames (< > : " / \ | ? * and ASCII 0-31 control characters).
 * Trims trailing dots and spaces that Windows prohibits.
 */
export function sanitizeFilenamePart(text: string): string {
  if (!text) return '';
  return text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

/**
 * Generates the canonical relative path for a desired song:
 * "Artist - Title.mp3" or "Artist - Title (Version).mp3"
 */
export function formatDefaultRelativePath(
  artist: string,
  title: string,
  versionType: VersionType = VersionType.STANDARD
): string {
  const cleanArtist = sanitizeFilenamePart(artist) || 'Unknown Artist';
  const cleanTitle = sanitizeFilenamePart(title) || 'Unknown Title';

  let versionSuffix = '';
  if (versionType !== VersionType.STANDARD) {
    const detected = detectVersionType(cleanTitle);
    if (detected !== versionType) {
      const label = versionType.charAt(0).toUpperCase() + versionType.slice(1);
      versionSuffix = ` (${label})`;
    }
  }

  return `${cleanArtist} - ${cleanTitle}${versionSuffix}.mp3`;
}

export class SyncService {
  private readonly songRepo: D1SongRepository;
  private readonly trackRepo: D1TrackRepository;
  private readonly syncStateRepo: D1SyncStateRepository;

  constructor(
    private readonly db: D1Database,
    songRepo?: D1SongRepository,
    trackRepo?: D1TrackRepository,
    syncStateRepo?: D1SyncStateRepository
  ) {
    this.songRepo = songRepo ?? new D1SongRepository(db);
    this.trackRepo = trackRepo ?? new D1TrackRepository(db);
    this.syncStateRepo = syncStateRepo ?? new D1SyncStateRepository(db);
  }

  /**
   * Retrieves a consistent snapshot of desired and obsolete tracks along with current sync_version.
   */
  async getSyncState(): Promise<SyncStateResponse> {
    const syncState = await this.syncStateRepo.get();
    const allSongs = await this.songRepo.listAll();
    const allTracks = await this.trackRepo.listAll();

    const trackBySongId = new Map<number, (typeof allTracks)[0]>();
    for (const track of allTracks) {
      trackBySongId.set(track.song_id, track);
    }

    const songById = new Map<number, (typeof allSongs)[0]>();
    for (const song of allSongs) {
      songById.set(song.id, song);
    }

    const desiredTracks: DesiredTrackDto[] = [];
    for (const song of allSongs) {
      if (song.status === SongStatus.ACTIVE) {
        const track = trackBySongId.get(song.id);
        const relativePath = track
          ? track.relative_path
          : formatDefaultRelativePath(song.artist, song.title, song.version_type);

        desiredTracks.push({
          song_id: song.id,
          artist: song.artist,
          title: song.title,
          version_type: song.version_type,
          youtube_url: song.youtube_url,
          relative_path: relativePath,
        });
      }
    }

    const obsoleteTracks: ObsoleteTrackDto[] = [];
    for (const track of allTracks) {
      const song = songById.get(track.song_id);
      if (song && song.status === SongStatus.REMOVED) {
        obsoleteTracks.push({
          song_id: song.id,
          artist: song.artist,
          title: song.title,
          relative_path: track.relative_path,
        });
      }
    }

    return {
      sync_version: syncState.sync_version,
      desired_tracks: desiredTracks,
      obsolete_tracks: obsoleteTracks,
    };
  }

  /**
   * Validates and processes a sync report submitted by the client.
   * Handles download confirmations, safe deletions of obsolete tracks, and USB imports.
   */
  async processReport(rawReport: unknown): Promise<SyncReportResponse> {
    if (!rawReport || typeof rawReport !== 'object') {
      throw new SyncValidationError('Request body must be a JSON object');
    }

    const report = rawReport as Partial<SyncReportRequest>;

    if (
      typeof report.sync_version !== 'number' ||
      !Number.isInteger(report.sync_version) ||
      report.sync_version < 0
    ) {
      throw new SyncValidationError(
        'Field "sync_version" must be a non-negative integer'
      );
    }

    if (report.status !== 'success' && report.status !== 'failed') {
      throw new SyncValidationError(
        'Field "status" must be either "success" or "failed"'
      );
    }

    if (!Array.isArray(report.operations)) {
      throw new SyncValidationError(
        'Field "operations" must be an array of operation objects'
      );
    }

    // Check version consistency
    const currentSyncState = await this.syncStateRepo.get();
    if (report.sync_version > currentSyncState.sync_version) {
      throw new SyncConflictError(
        'VERSION_CONFLICT',
        `Report sync_version (${report.sync_version}) is greater than current backend version (${currentSyncState.sync_version})`,
        {
          reported_version: report.sync_version,
          backend_version: currentSyncState.sync_version,
        }
      );
    }

    // Validate operations structure & detect conflicts
    for (let i = 0; i < report.operations.length; i++) {
      const op = report.operations[i];
      if (!op || typeof op !== 'object') {
        throw new SyncValidationError(`Operation at index ${i} is invalid`);
      }

      if (op.type === 'download') {
        if (typeof op.song_id !== 'number' || !op.relative_path || typeof op.relative_path !== 'string') {
          throw new SyncValidationError(
            `Download operation at index ${i} missing required song_id or relative_path`
          );
        }
      } else if (op.type === 'delete') {
        if (typeof op.song_id !== 'number') {
          throw new SyncValidationError(
            `Delete operation at index ${i} missing required song_id`
          );
        }

        // Conflict check: cannot delete track for currently active song
        const song = await this.songRepo.findById(op.song_id);
        if (song && song.status === SongStatus.ACTIVE) {
          throw new SyncConflictError(
            'VERSION_CONFLICT',
            `Cannot delete track for active song "${song.artist} - ${song.title}" (id: ${song.id})`,
            { song_id: song.id, status: song.status }
          );
        }
      } else if (op.type === 'import') {
        if (
          !op.song ||
          typeof op.song !== 'object' ||
          !op.song.artist ||
          typeof op.song.artist !== 'string' ||
          !op.song.title ||
          typeof op.song.title !== 'string' ||
          !op.relative_path ||
          typeof op.relative_path !== 'string'
        ) {
          throw new SyncValidationError(
            `Import operation at index ${i} requires valid song.artist, song.title, and relative_path`
          );
        }
      } else {
        throw new SyncValidationError(
          `Unknown operation type "${(op as { type?: string }).type}" at index ${i}`
        );
      }
    }

    let tracksConfirmed = 0;
    let tracksRemoved = 0;
    let songsImported = 0;
    let shouldAdvanceVersion = false;
    const now = getCurrentIsoTimestamp();

    for (const op of report.operations) {
      if (op.type === 'download') {
        const song = await this.songRepo.findById(op.song_id);
        if (song) {
          const relativePath = op.relative_path.trim();
          const existingTrack = await this.trackRepo.findBySongId(song.id);
          if (!existingTrack) {
            // Check if another track has the same relative_path
            const trackWithPath = await this.trackRepo.findByRelativePath(relativePath);
            if (trackWithPath) {
              await this.db
                .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                .bind(song.id, now, trackWithPath.id)
                .run();
            } else {
              await this.trackRepo.insert(song.id, relativePath, now);
            }
          } else if (existingTrack.relative_path !== relativePath) {
            await this.db
              .prepare('UPDATE tracks SET relative_path = ?, updated_at = ? WHERE id = ?')
              .bind(relativePath, now, existingTrack.id)
              .run();
          }
          tracksConfirmed++;
        }
      } else if (op.type === 'delete') {
        const track = await this.trackRepo.findBySongId(op.song_id);
        if (track) {
          await this.trackRepo.delete(track.id);
          tracksRemoved++;
        } else if (op.relative_path) {
          const trackByPath = await this.trackRepo.findByRelativePath(op.relative_path.trim());
          if (trackByPath) {
            await this.trackRepo.delete(trackByPath.id);
            tracksRemoved++;
          }
        }
      } else if (op.type === 'import') {
        const artist = op.song.artist.trim();
        const title = op.song.title.trim();
        const versionType = op.song.version_type
          ? parseVersionType(op.song.version_type)
          : detectVersionType(title);
        const normalizedArtist = normalizeString(artist);
        const normalizedTitle = normalizeString(stripVideoClutter(title));
        const relativePath = op.relative_path.trim();
        const youtubeUrl = op.song.youtube_url?.trim() || null;

        const existingSong = await this.songRepo.findByIdentity(
          normalizedArtist,
          normalizedTitle,
          versionType
        );

        if (!existingSong) {
          // Insert new song and associate track
          const newSong = await this.songRepo.insert(
            {
              artist,
              title,
              normalized_artist: normalizedArtist,
              normalized_title: normalizedTitle,
              version_type: versionType,
              youtube_url: youtubeUrl,
            },
            now
          );

          const existingTrackByPath = await this.trackRepo.findByRelativePath(relativePath);
          if (existingTrackByPath) {
            await this.db
              .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
              .bind(newSong.id, now, existingTrackByPath.id)
              .run();
          } else {
            await this.trackRepo.insert(newSong.id, relativePath, now);
          }

          shouldAdvanceVersion = true;
          songsImported++;
        } else if (existingSong.status === SongStatus.REMOVED) {
          // Reactivate previously removed song
          await this.songRepo.reactivate(existingSong.id, youtubeUrl, now);

          const existingTrack = await this.trackRepo.findBySongId(existingSong.id);
          if (!existingTrack) {
            const existingTrackByPath = await this.trackRepo.findByRelativePath(relativePath);
            if (existingTrackByPath) {
              await this.db
                .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                .bind(existingSong.id, now, existingTrackByPath.id)
                .run();
            } else {
              await this.trackRepo.insert(existingSong.id, relativePath, now);
            }
          }
          shouldAdvanceVersion = true;
          songsImported++;
        } else {
          // Song already active (idempotent duplicate import)
          const existingTrack = await this.trackRepo.findBySongId(existingSong.id);
          if (!existingTrack) {
            const existingTrackByPath = await this.trackRepo.findByRelativePath(relativePath);
            if (existingTrackByPath) {
              await this.db
                .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                .bind(existingSong.id, now, existingTrackByPath.id)
                .run();
            } else {
              await this.trackRepo.insert(existingSong.id, relativePath, now);
            }
          }
          tracksConfirmed++;
        }
      }
    }

    if (shouldAdvanceVersion) {
      await this.syncStateRepo.incrementVersion();
    }

    await this.syncStateRepo.updateSyncCompletion(
      report.status as SyncStatus,
      null,
      now
    );

    const updatedSyncState = await this.syncStateRepo.get();

    return {
      acknowledged: true,
      sync_version: updatedSyncState.sync_version,
      summary: {
        tracks_confirmed: tracksConfirmed,
        tracks_removed: tracksRemoved,
        songs_imported: songsImported,
      },
    };
  }
}

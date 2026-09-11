import { SongStatus } from '../domain/song.js';
import { VersionType, parseVersionType } from '../domain/version_type.js';
import {
  detectVersionType,
  normalizeString,
  stripVideoClutter,
} from '../domain/normalization.js';
import { D1SongRepository, mapSongRow, SongRow } from '../persistence/song_repository.js';
import { D1TrackRepository, mapTrackRow, TrackRow } from '../persistence/track_repository.js';
import { D1SyncStateRepository, mapSyncStateRow, SyncStateRow } from '../persistence/sync_state_repository.js';
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
  let sanitized = text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');

  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized)) {
    sanitized = `${sanitized}_`;
  }
  return sanitized;
}

/**
 * Generates the canonical relative path for a desired song:
 * "Title - Artist.mp3" or "Title - Artist (Version).mp3"
 * (Per REQUIREMENTS.md Section 32: Title - Artist.mp3)
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

  return `${cleanTitle} - ${cleanArtist}${versionSuffix}.mp3`;
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
   * Retrieves an atomic, consistent snapshot of desired and obsolete tracks along with current sync_version.
   */
  async getSyncState(): Promise<SyncStateResponse> {
    const [syncRes, songsRes, tracksRes] = await this.db.batch([
      this.syncStateRepo.prepareGet(),
      this.songRepo.prepareListAll(),
      this.trackRepo.prepareListAll(),
    ]);

    let syncStateRow = syncRes.results?.[0] as SyncStateRow | undefined;
    if (!syncStateRow) {
      await this.syncStateRepo.get();
      const retryRes = await this.db.batch([
        this.syncStateRepo.prepareGet(),
        this.songRepo.prepareListAll(),
        this.trackRepo.prepareListAll(),
      ]);
      syncStateRow = retryRes[0].results?.[0] as SyncStateRow;
    }

    const syncState = mapSyncStateRow(syncStateRow);
    const allSongs = (songsRes.results ?? []).map((r) => mapSongRow(r as unknown as SongRow));
    const allTracks = (tracksRes.results ?? []).map((r) => mapTrackRow(r as unknown as TrackRow));

    const trackBySongId = new Map<number, (typeof allTracks)[0]>();
    for (const track of allTracks) {
      trackBySongId.set(track.song_id, track);
    }

    const songById = new Map<number, (typeof allSongs)[0]>();
    for (const song of allSongs) {
      songById.set(song.id, song);
    }

    const usedPaths = new Set<string>();
    const desiredTracks: DesiredTrackDto[] = [];
    for (const song of allSongs) {
      if (song.status === SongStatus.ACTIVE) {
        const track = trackBySongId.get(song.id);
        let relativePath = track
          ? track.relative_path
          : formatDefaultRelativePath(song.artist, song.title, song.version_type);

        if (usedPaths.has(relativePath.toLowerCase())) {
          const extIdx = relativePath.lastIndexOf('.');
          const base = extIdx !== -1 ? relativePath.slice(0, extIdx) : relativePath;
          const ext = extIdx !== -1 ? relativePath.slice(extIdx) : '.mp3';
          relativePath = `${base} (${song.id})${ext}`;
        }
        usedPaths.add(relativePath.toLowerCase());

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
   * Validates and processes a sync report submitted by the client atomically.
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
    const batchStatements: D1PreparedStatement[] = [];

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
              batchStatements.push(
                this.db
                  .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                  .bind(song.id, now, trackWithPath.id)
              );
            } else {
              batchStatements.push(this.trackRepo.prepareInsert(song.id, relativePath, now));
            }
          } else if (existingTrack.relative_path !== relativePath) {
            batchStatements.push(
              this.db
                .prepare('UPDATE tracks SET relative_path = ?, updated_at = ? WHERE id = ?')
                .bind(relativePath, now, existingTrack.id)
            );
          }
          tracksConfirmed++;
        }
      } else if (op.type === 'delete') {
        const track = await this.trackRepo.findBySongId(op.song_id);
        if (track) {
          batchStatements.push(this.trackRepo.prepareDelete(track.id));
          tracksRemoved++;
        } else if (op.relative_path) {
          const trackByPath = await this.trackRepo.findByRelativePath(op.relative_path.trim());
          if (trackByPath) {
            batchStatements.push(this.trackRepo.prepareDelete(trackByPath.id));
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
          // Insert new song and associate track via last_insert_rowid()
          batchStatements.push(
            this.songRepo.prepareInsert(
              {
                artist,
                title,
                normalized_artist: normalizedArtist,
                normalized_title: normalizedTitle,
                version_type: versionType,
                youtube_url: youtubeUrl,
              },
              now
            )
          );

          const existingTrackByPath = await this.trackRepo.findByRelativePath(relativePath);
          if (existingTrackByPath) {
            batchStatements.push(
              this.db
                .prepare('UPDATE tracks SET song_id = last_insert_rowid(), updated_at = ? WHERE id = ?')
                .bind(now, existingTrackByPath.id)
            );
          } else {
            batchStatements.push(
              this.db
                .prepare(
                  `INSERT INTO tracks (song_id, relative_path, created_at, updated_at)
                   VALUES (last_insert_rowid(), ?, ?, ?)`
                )
                .bind(relativePath, now, now)
            );
          }

          shouldAdvanceVersion = true;
          songsImported++;
        } else if (existingSong.status === SongStatus.REMOVED) {
          // Reactivate previously removed song
          batchStatements.push(this.songRepo.prepareReactivate(existingSong.id, youtubeUrl, now));

          const existingTrack = await this.trackRepo.findBySongId(existingSong.id);
          if (!existingTrack) {
            const existingTrackByPath = await this.trackRepo.findByRelativePath(relativePath);
            if (existingTrackByPath) {
              batchStatements.push(
                this.db
                  .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                  .bind(existingSong.id, now, existingTrackByPath.id)
              );
            } else {
              batchStatements.push(this.trackRepo.prepareInsert(existingSong.id, relativePath, now));
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
              batchStatements.push(
                this.db
                  .prepare('UPDATE tracks SET song_id = ?, updated_at = ? WHERE id = ?')
                  .bind(existingSong.id, now, existingTrackByPath.id)
              );
            } else {
              batchStatements.push(this.trackRepo.prepareInsert(existingSong.id, relativePath, now));
            }
          }
          tracksConfirmed++;
        }
      }
    }

    if (shouldAdvanceVersion) {
      batchStatements.push(this.syncStateRepo.prepareIncrementVersion());
    }

    batchStatements.push(
      this.syncStateRepo.prepareUpdateSyncCompletion(
        report.status as SyncStatus,
        null,
        now
      )
    );

    if (batchStatements.length > 0) {
      await this.db.batch(batchStatements);
    }

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

import { D1SongRepository } from '../persistence/song_repository.js';
import { D1SyncStateRepository } from '../persistence/sync_state_repository.js';
import { DuplicateChecker, DuplicateStatus } from './duplicate_checker.js';
import { Song, SongStatus, CreateSongInput } from '../domain/song.js';
import { VersionType } from '../domain/version_type.js';
import { normalizeString, stripVideoClutter } from '../domain/normalization.js';
import { getCurrentIsoTimestamp } from '../persistence/d1_database.js';

export interface AddSongResult {
  song: Song;
  status: 'added' | 'reactivated' | 'already_active';
  sync_version: number;
}

export interface ForceAddSongResult {
  song: Song;
  status: 'added' | 'updated' | 'reactivated';
  sync_version: number;
}

export interface RemoveSongResult {
  success: boolean;
  song?: Song;
  sync_version: number;
}

export class LibraryService {
  private readonly duplicateChecker: DuplicateChecker;

  constructor(
    private readonly db: D1Database,
    private readonly songRepo: D1SongRepository,
    private readonly syncRepo: D1SyncStateRepository
  ) {
    this.duplicateChecker = new DuplicateChecker(songRepo);
  }

  async listActiveSongs(): Promise<Song[]> {
    return this.songRepo.listActive();
  }

  async findSongById(id: number): Promise<Song | null> {
    return this.songRepo.findById(id);
  }

  /**
   * Adds a new song or logically reactivates a soft-deleted song.
   * Atomically increments sync_version on mutation using db.batch().
   */
  async addSong(input: {
    artist: string;
    title: string;
    version_type: VersionType;
    youtube_url?: string | null;
  }): Promise<AddSongResult> {
    const dupCheck = await this.duplicateChecker.checkDuplicate(
      input.artist,
      input.title,
      input.version_type,
      input.youtube_url
    );

    const now = getCurrentIsoTimestamp();

    if (dupCheck.status === DuplicateStatus.ACTIVE_SAME_URL && dupCheck.existingSong) {
      const state = await this.syncRepo.get();
      return {
        song: dupCheck.existingSong,
        status: 'already_active',
        sync_version: state.sync_version,
      };
    }

    if (dupCheck.status === DuplicateStatus.ACTIVE_DIFFERENT_URL && dupCheck.existingSong) {
      const state = await this.syncRepo.get();
      return {
        song: dupCheck.existingSong,
        status: 'already_active',
        sync_version: state.sync_version,
      };
    }

    if (dupCheck.status === DuplicateStatus.URL_ALREADY_USED_BY_OTHER && dupCheck.existingSong) {
      throw new Error(
        `L'URL sorgente è già utilizzata per "${dupCheck.existingSong.artist} - ${dupCheck.existingSong.title}".`
      );
    }

    if (dupCheck.status === DuplicateStatus.REMOVED && dupCheck.existingSong) {
      // Reactivate soft-deleted song atomically with sync_version increment
      const reactivateStmt = this.songRepo.prepareReactivate(
        dupCheck.existingSong.id,
        input.youtube_url ?? null,
        now
      );
      const incStmt = this.syncRepo.prepareIncrementVersion();

      const [reactivatedRes, incRes] = await this.db.batch([reactivateStmt, incStmt]);
      const songRow = (reactivatedRes.results?.[0] as unknown as Song) ?? dupCheck.existingSong;
      const newVersion = Number((incRes.results?.[0] as { sync_version: number })?.sync_version);

      const refreshed = await this.songRepo.findById(dupCheck.existingSong.id);

      return {
        song: refreshed ?? songRow,
        status: 'reactivated',
        sync_version: newVersion,
      };
    }

    // New song insertion: atomic batch with sync_version increment
    const cleanTitle = stripVideoClutter(input.title.trim());
    const finalTitle = cleanTitle.length > 0 ? cleanTitle : input.title.trim();

    const songInput: CreateSongInput = {
      artist: input.artist.trim(),
      title: finalTitle,
      normalized_artist: normalizeString(input.artist),
      normalized_title: normalizeString(finalTitle),
      version_type: input.version_type,
      youtube_url: input.youtube_url ?? null,
    };

    const insertStmt = this.songRepo.prepareInsert(songInput, now);
    const incStmt = this.syncRepo.prepareIncrementVersion();

    const [insertRes, incRes] = await this.db.batch([insertStmt, incStmt]);
    const returnedRow = insertRes.results?.[0] as unknown as Song | undefined;
    const songId = returnedRow?.id ?? Number((insertRes.meta as { last_row_id?: number })?.last_row_id);
    const newVersion = Number((incRes.results?.[0] as { sync_version: number })?.sync_version);

    const created = (await this.songRepo.findById(songId)) ?? returnedRow;
    if (!created) {
      throw new Error('Impossibile recuperare il brano inserito');
    }

    return {
      song: created,
      status: 'added',
      sync_version: newVersion,
    };
  }

  /**
   * Forced song addition (/force):
   * Overrides duplicate protection by updating URL of existing active song or reactivating removed song.
   */
  async forceAddSong(input: {
    artist: string;
    title: string;
    version_type: VersionType;
    youtube_url: string;
  }): Promise<ForceAddSongResult> {
    const cleanTitle = stripVideoClutter(input.title.trim());
    const finalTitle = cleanTitle.length > 0 ? cleanTitle : input.title.trim();
    const normArtist = normalizeString(input.artist);
    const normTitle = normalizeString(finalTitle);
    const now = getCurrentIsoTimestamp();

    // Check if the target youtube_url is already assigned to ANOTHER distinct active song
    if (input.youtube_url) {
      const existingByUrl = await this.songRepo.findByYouTubeUrl(input.youtube_url);
      if (existingByUrl && existingByUrl.status !== SongStatus.REMOVED) {
        const existingById = await this.songRepo.findByIdentity(
          normArtist,
          normTitle,
          input.version_type
        );
        if (!existingById || existingById.id !== existingByUrl.id) {
          throw new Error(
            `L'URL YouTube è già associato a un altro brano attivo: "${existingByUrl.artist} - ${existingByUrl.title}".`
          );
        }
      }
    }

    const existing = await this.songRepo.findByIdentity(
      normArtist,
      normTitle,
      input.version_type
    );

    if (existing) {
      if (existing.status === SongStatus.REMOVED) {
        const reactivateStmt = this.songRepo.prepareReactivate(
          existing.id,
          input.youtube_url,
          now
        );
        const incStmt = this.syncRepo.prepareIncrementVersion();
        const [, incRes] = await this.db.batch([reactivateStmt, incStmt]);
        const newVersion = Number((incRes.results?.[0] as { sync_version: number })?.sync_version);
        const updated = await this.songRepo.findById(existing.id);

        return {
          song: updated ?? existing,
          status: 'reactivated',
          sync_version: newVersion,
        };
      }

      // Existing song is active: update its youtube_url
      const updateStmt = this.db
        .prepare('UPDATE songs SET youtube_url = ?, updated_at = ? WHERE id = ?')
        .bind(input.youtube_url, now, existing.id);
      const incStmt = this.syncRepo.prepareIncrementVersion();

      const [, incRes] = await this.db.batch([updateStmt, incStmt]);
      const newVersion = Number((incRes.results?.[0] as { sync_version: number })?.sync_version);
      const updated = await this.songRepo.findById(existing.id);

      return {
        song: updated ?? existing,
        status: 'updated',
        sync_version: newVersion,
      };
    }

    // Song does not exist yet: insert normally
    const addResult = await this.addSong({
      ...input,
      title: finalTitle,
    });
    return {
      song: addResult.song,
      status: 'added',
      sync_version: addResult.sync_version,
    };
  }

  /**
   * Soft-removes a song from the desired library and atomically increments sync_version.
   */
  async removeSong(songId: number): Promise<RemoveSongResult> {
    const existing = await this.songRepo.findById(songId);
    if (!existing || existing.status === SongStatus.REMOVED) {
      const state = await this.syncRepo.get();
      return {
        success: false,
        sync_version: state.sync_version,
      };
    }

    const now = getCurrentIsoTimestamp();
    const deleteStmt = this.songRepo.prepareSoftDelete(songId, now);
    const incStmt = this.syncRepo.prepareIncrementVersion();

    const [, incRes] = await this.db.batch([deleteStmt, incStmt]);
    const newVersion = Number((incRes.results?.[0] as { sync_version: number })?.sync_version);
    const updated = await this.songRepo.findById(songId);

    return {
      success: true,
      song: updated ?? undefined,
      sync_version: newVersion,
    };
  }
}

import { D1SongRepository } from '../persistence/song_repository.js';
import { Song, SongStatus } from '../domain/song.js';
import { VersionType } from '../domain/version_type.js';
import { normalizeString } from '../domain/normalization.js';

export enum DuplicateStatus {
  NOT_FOUND = 'not_found',
  ACTIVE_SAME_URL = 'active_same_url',
  ACTIVE_DIFFERENT_URL = 'active_different_url',
  REMOVED = 'removed',
  URL_ALREADY_USED_BY_OTHER = 'url_already_used_by_other',
}

export interface DuplicateCheckResult {
  status: DuplicateStatus;
  existingSong?: Song;
  reason?: string;
}

export class DuplicateChecker {
  constructor(private readonly songRepo: D1SongRepository) {}

  async checkDuplicate(
    artist: string,
    title: string,
    versionType: VersionType,
    youtubeUrl?: string | null
  ): Promise<DuplicateCheckResult> {
    const normArtist = normalizeString(artist);
    const normTitle = normalizeString(title);

    // 1. Check logical identity match: (normalized_artist, normalized_title, version_type)
    const existingByIdentity = await this.songRepo.findByIdentity(
      normArtist,
      normTitle,
      versionType
    );

    if (existingByIdentity) {
      if (existingByIdentity.status === SongStatus.REMOVED) {
        return {
          status: DuplicateStatus.REMOVED,
          existingSong: existingByIdentity,
          reason: 'Il brano è stato rimosso in precedenza e può essere riattivato.',
        };
      }

      // Existing song is active
      if (youtubeUrl && existingByIdentity.youtube_url === youtubeUrl) {
        return {
          status: DuplicateStatus.ACTIVE_SAME_URL,
          existingSong: existingByIdentity,
          reason: 'Il brano è già presente nella libreria attiva con la stessa sorgente.',
        };
      }

      return {
        status: DuplicateStatus.ACTIVE_DIFFERENT_URL,
        existingSong: existingByIdentity,
        reason: 'Il brano è già presente nella libreria attiva con una sorgente diversa.',
      };
    }

    // 2. Check if the provided YouTube URL is already attached to another distinct song
    if (youtubeUrl) {
      const existingByUrl = await this.songRepo.findByYouTubeUrl(youtubeUrl);
      if (existingByUrl) {
        return {
          status: DuplicateStatus.URL_ALREADY_USED_BY_OTHER,
          existingSong: existingByUrl,
          reason: `L'URL YouTube è già associato a "${existingByUrl.artist} - ${existingByUrl.title}".`,
        };
      }
    }

    return {
      status: DuplicateStatus.NOT_FOUND,
    };
  }
}

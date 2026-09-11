import { Song, CreateSongInput, SongStatus } from '../domain/song.js';
import { VersionType, parseVersionType } from '../domain/version_type.js';
import { getCurrentIsoTimestamp } from './d1_database.js';

export interface SongRow {
  id: number;
  artist: string;
  title: string;
  normalized_artist: string;
  normalized_title: string;
  version_type: string;
  youtube_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function mapSongRow(row: SongRow): Song {
  return {
    id: Number(row.id),
    artist: row.artist,
    title: row.title,
    normalized_artist: row.normalized_artist,
    normalized_title: row.normalized_title,
    version_type: parseVersionType(row.version_type),
    youtube_url: row.youtube_url ?? null,
    status: row.status === SongStatus.REMOVED ? SongStatus.REMOVED : SongStatus.ACTIVE,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class D1SongRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: number): Promise<Song | null> {
    const row = await this.db
      .prepare('SELECT * FROM songs WHERE id = ?')
      .bind(id)
      .first<SongRow>();

    return row ? mapSongRow(row) : null;
  }

  async findByIdentity(
    normalizedArtist: string,
    normalizedTitle: string,
    versionType: VersionType
  ): Promise<Song | null> {
    const row = await this.db
      .prepare(
        'SELECT * FROM songs WHERE normalized_artist = ? AND normalized_title = ? AND version_type = ?'
      )
      .bind(normalizedArtist, normalizedTitle, versionType)
      .first<SongRow>();

    return row ? mapSongRow(row) : null;
  }

  async findByYouTubeUrl(youtubeUrl: string): Promise<Song | null> {
    const row = await this.db
      .prepare('SELECT * FROM songs WHERE youtube_url = ?')
      .bind(youtubeUrl)
      .first<SongRow>();

    return row ? mapSongRow(row) : null;
  }

  async listActive(): Promise<Song[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM songs WHERE status = 'active' ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE"
      )
      .all<SongRow>();

    return (result.results ?? []).map(mapSongRow);
  }

  prepareListAll(): D1PreparedStatement {
    return this.db.prepare('SELECT * FROM songs ORDER BY id ASC');
  }

  async listAll(): Promise<Song[]> {
    const result = await this.prepareListAll().all<SongRow>();

    return (result.results ?? []).map(mapSongRow);
  }

  prepareInsert(input: CreateSongInput, timestamp = getCurrentIsoTimestamp()): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO songs (
          artist, title, normalized_artist, normalized_title, version_type,
          youtube_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING *`
      )
      .bind(
        input.artist,
        input.title,
        input.normalized_artist,
        input.normalized_title,
        input.version_type,
        input.youtube_url ?? null,
        timestamp,
        timestamp
      );
  }

  async insert(input: CreateSongInput, timestamp = getCurrentIsoTimestamp()): Promise<Song> {
    const row = await this.prepareInsert(input, timestamp).first<SongRow>();
    if (!row) {
      throw new Error('Failed to insert song into database');
    }
    return mapSongRow(row);
  }

  prepareReactivate(
    id: number,
    youtubeUrl: string | null = null,
    timestamp = getCurrentIsoTimestamp()
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE songs
         SET status = 'active',
             youtube_url = COALESCE(?, youtube_url),
             updated_at = ?
         WHERE id = ? RETURNING *`
      )
      .bind(youtubeUrl, timestamp, id);
  }

  async reactivate(
    id: number,
    youtubeUrl: string | null = null,
    timestamp = getCurrentIsoTimestamp()
  ): Promise<Song> {
    const row = await this.prepareReactivate(id, youtubeUrl, timestamp).first<SongRow>();
    if (!row) {
      throw new Error(`Failed to reactivate song with id ${id}`);
    }
    return mapSongRow(row);
  }

  /**
   * Logical UPSERT:
   * - If no song with (normalized_artist, normalized_title, version_type) exists, inserts a new song.
   * - If song exists with status = 'removed', reactivates it to 'active' and updates url/timestamp.
   * - If song exists with status = 'active', returns the existing record without duplicate error.
   */
  async upsertOrReactivate(
    input: CreateSongInput,
    timestamp = getCurrentIsoTimestamp()
  ): Promise<{ song: Song; reactivated: boolean; wasExisting: boolean }> {
    const existing = await this.findByIdentity(
      input.normalized_artist,
      input.normalized_title,
      input.version_type
    );

    if (!existing) {
      const inserted = await this.insert(input, timestamp);
      return { song: inserted, reactivated: false, wasExisting: false };
    }

    if (existing.status === SongStatus.REMOVED) {
      const reactivated = await this.reactivate(
        existing.id,
        input.youtube_url ?? null,
        timestamp
      );
      return { song: reactivated, reactivated: true, wasExisting: true };
    }

    // Already active
    return { song: existing, reactivated: false, wasExisting: true };
  }

  prepareSoftDelete(id: number, timestamp = getCurrentIsoTimestamp()): D1PreparedStatement {
    return this.db
      .prepare("UPDATE songs SET status = 'removed', updated_at = ? WHERE id = ?")
      .bind(timestamp, id);
  }

  async softDelete(id: number, timestamp = getCurrentIsoTimestamp()): Promise<boolean> {
    const result = await this.prepareSoftDelete(id, timestamp).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async updateYouTubeUrl(
    id: number,
    youtubeUrl: string | null,
    timestamp = getCurrentIsoTimestamp()
  ): Promise<void> {
    await this.db
      .prepare('UPDATE songs SET youtube_url = ?, updated_at = ? WHERE id = ?')
      .bind(youtubeUrl, timestamp, id)
      .run();
  }
}

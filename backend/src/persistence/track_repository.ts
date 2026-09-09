import { Track } from '../domain/track.js';
import { getCurrentIsoTimestamp } from './d1_database.js';

interface TrackRow {
  id: number;
  song_id: number;
  relative_path: string;
  created_at: string;
  updated_at: string;
}

export function mapTrackRow(row: TrackRow): Track {
  return {
    id: Number(row.id),
    song_id: Number(row.song_id),
    relative_path: row.relative_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class D1TrackRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: number): Promise<Track | null> {
    const row = await this.db
      .prepare('SELECT * FROM tracks WHERE id = ?')
      .bind(id)
      .first<TrackRow>();

    return row ? mapTrackRow(row) : null;
  }

  async findBySongId(songId: number): Promise<Track | null> {
    const row = await this.db
      .prepare('SELECT * FROM tracks WHERE song_id = ?')
      .bind(songId)
      .first<TrackRow>();

    return row ? mapTrackRow(row) : null;
  }

  async findByRelativePath(relativePath: string): Promise<Track | null> {
    const row = await this.db
      .prepare('SELECT * FROM tracks WHERE relative_path = ?')
      .bind(relativePath)
      .first<TrackRow>();

    return row ? mapTrackRow(row) : null;
  }

  async listAll(): Promise<Track[]> {
    const result = await this.db
      .prepare('SELECT * FROM tracks ORDER BY id ASC')
      .all<TrackRow>();

    return (result.results ?? []).map(mapTrackRow);
  }

  prepareInsert(
    songId: number,
    relativePath: string,
    timestamp = getCurrentIsoTimestamp()
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO tracks (song_id, relative_path, created_at, updated_at)
         VALUES (?, ?, ?, ?) RETURNING *`
      )
      .bind(songId, relativePath, timestamp, timestamp);
  }

  async insert(
    songId: number,
    relativePath: string,
    timestamp = getCurrentIsoTimestamp()
  ): Promise<Track> {
    const row = await this.prepareInsert(songId, relativePath, timestamp).first<TrackRow>();
    if (!row) {
      throw new Error('Failed to insert track into database');
    }
    return mapTrackRow(row);
  }

  prepareDelete(id: number): D1PreparedStatement {
    return this.db.prepare('DELETE FROM tracks WHERE id = ?').bind(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.prepareDelete(id).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  prepareDeleteBySongId(songId: number): D1PreparedStatement {
    return this.db.prepare('DELETE FROM tracks WHERE song_id = ?').bind(songId);
  }

  async deleteBySongId(songId: number): Promise<boolean> {
    const result = await this.prepareDeleteBySongId(songId).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  prepareDeleteByRelativePath(relativePath: string): D1PreparedStatement {
    return this.db.prepare('DELETE FROM tracks WHERE relative_path = ?').bind(relativePath);
  }

  async deleteByRelativePath(relativePath: string): Promise<boolean> {
    const result = await this.prepareDeleteByRelativePath(relativePath).run();
    return (result.meta?.changes ?? 0) > 0;
  }
}

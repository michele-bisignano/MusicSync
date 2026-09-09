import { VersionType } from './version_type.js';

export enum SongStatus {
  ACTIVE = 'active',
  REMOVED = 'removed',
}

export interface SongIdentity {
  normalized_artist: string;
  normalized_title: string;
  version_type: VersionType;
}

export interface Song {
  id: number;
  artist: string;
  title: string;
  normalized_artist: string;
  normalized_title: string;
  version_type: VersionType;
  youtube_url: string | null;
  status: SongStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateSongInput {
  artist: string;
  title: string;
  normalized_artist: string;
  normalized_title: string;
  version_type: VersionType;
  youtube_url?: string | null;
}

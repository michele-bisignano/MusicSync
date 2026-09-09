import { VersionType } from '../domain/version_type.js';

export interface SourceCandidate {
  video_id: string;
  youtube_url: string;
  title: string;
  channel_title?: string;
  duration_seconds?: number;
  view_count?: number;
}

export interface SourceProvider {
  readonly name: string;
  isAvailable(): boolean;
  findSources(artist: string, title: string, versionType: VersionType): Promise<SourceCandidate[]>;
  getSourceByUrl(youtubeUrl: string): Promise<SourceCandidate | null>;
}

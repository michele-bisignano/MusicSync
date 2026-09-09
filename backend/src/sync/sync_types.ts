import { VersionType } from '../domain/version_type.js';

export interface DesiredTrackDto {
  song_id: number;
  artist: string;
  title: string;
  version_type: VersionType;
  youtube_url: string | null;
  relative_path: string;
}

export interface ObsoleteTrackDto {
  song_id: number;
  artist: string;
  title: string;
  relative_path: string;
}

export interface SyncStateResponse {
  sync_version: number;
  desired_tracks: DesiredTrackDto[];
  obsolete_tracks: ObsoleteTrackDto[];
}

export interface SyncDownloadOperation {
  type: 'download';
  song_id: number;
  relative_path: string;
}

export interface SyncDeleteOperation {
  type: 'delete';
  song_id: number;
  relative_path?: string;
}

export interface SyncImportSongData {
  artist: string;
  title: string;
  version_type?: string;
  youtube_url?: string | null;
}

export interface SyncImportOperation {
  type: 'import';
  song: SyncImportSongData;
  relative_path: string;
}

export type SyncReportOperation =
  | SyncDownloadOperation
  | SyncDeleteOperation
  | SyncImportOperation;

export interface SyncReportRequest {
  sync_version: number;
  status: 'success' | 'failed';
  operations: SyncReportOperation[];
}

export interface SyncReportSummary {
  tracks_confirmed: number;
  tracks_removed: number;
  songs_imported: number;
}

export interface SyncReportResponse {
  acknowledged: boolean;
  sync_version: number;
  summary: SyncReportSummary;
}

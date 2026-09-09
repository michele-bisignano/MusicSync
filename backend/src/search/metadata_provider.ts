import { VersionType } from '../domain/version_type.js';

export interface MetadataCandidate {
  artist: string;
  title: string;
  version_type: VersionType;
  confidence?: number;
  spotify_id?: string;
  album?: string;
  extra?: Record<string, unknown>;
}

export interface MetadataProvider {
  readonly name: string;
  isAvailable(): boolean;
  resolveMetadata(query: string): Promise<MetadataCandidate[]>;
}

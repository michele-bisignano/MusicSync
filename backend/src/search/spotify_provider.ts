import { MetadataProvider, MetadataCandidate } from './metadata_provider.js';
import { detectVersionType } from '../domain/normalization.js';

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifySearchResponse {
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album?: { name: string };
      popularity?: number;
    }>;
  };
}

export class SpotifyMetadataProvider implements MetadataProvider {
  readonly name = 'Spotify';
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId?: string,
    private readonly clientSecret?: string
  ) {}

  isAvailable(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt > now + 60_000) {
      return this.cachedToken;
    }

    try {
      const credentials = btoa(`${this.clientId}:${this.clientSecret}`);
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as SpotifyTokenResponse;
      this.cachedToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;
      return this.cachedToken;
    } catch {
      return null;
    }
  }

  async resolveMetadata(query: string): Promise<MetadataCandidate[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const token = await this.getAccessToken();
    if (!token) {
      return [];
    }

    try {
      const url = `https://api.spotify.com/v1/search?type=track&limit=5&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as SpotifySearchResponse;
      const items = data.tracks?.items ?? [];

      return items.map((item) => {
        const artist = item.artists.map((a) => a.name).join(', ') || 'Unknown Artist';
        const title = item.name;
        const version_type = detectVersionType(title);

        return {
          artist,
          title,
          version_type,
          spotify_id: item.id,
          album: item.album?.name,
          confidence: item.popularity ? item.popularity / 100 : 0.8,
        };
      });
    } catch {
      return [];
    }
  }
}

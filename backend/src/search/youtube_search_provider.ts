import { MetadataProvider, MetadataCandidate } from './metadata_provider.js';
import { detectVersionType, parseArtistAndTitle, stripVideoClutter } from '../domain/normalization.js';

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

export class YouTubeSearchMetadataProvider implements MetadataProvider {
  readonly name = 'YouTubeSearch';

  constructor(private readonly apiKey?: string) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async resolveMetadata(query: string): Promise<MetadataCandidate[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as YouTubeSearchResponse;
      const items = data.items ?? [];
      const candidates: MetadataCandidate[] = [];

      for (const item of items) {
        const rawTitle = item.snippet?.title;
        if (!rawTitle) continue;

        const parsed = parseArtistAndTitle(rawTitle);
        const version_type = detectVersionType(rawTitle);

        if (parsed) {
          candidates.push({
            artist: parsed.artist,
            title: stripVideoClutter(parsed.title),
            version_type,
            confidence: 0.7,
            extra: { videoId: item.id?.videoId, channel: item.snippet?.channelTitle },
          });
        } else {
          // Fallback: use channel title as artist or query artist
          const artist = item.snippet?.channelTitle || 'Unknown Artist';
          const title = stripVideoClutter(rawTitle);
          candidates.push({
            artist,
            title,
            version_type,
            confidence: 0.5,
            extra: { videoId: item.id?.videoId },
          });
        }
      }

      return candidates;
    } catch {
      return [];
    }
  }
}

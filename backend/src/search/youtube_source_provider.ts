import { SourceProvider, SourceCandidate } from './source_provider.js';
import { VersionType } from '../domain/version_type.js';
import { validateYouTubeUrl } from '../validation/youtube_url.js';

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
  };
}

interface YouTubeVideoListResponse {
  items?: YouTubeVideoItem[];
}

interface YouTubeSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
    };
  }>;
}

export class YouTubeSourceProvider implements SourceProvider {
  readonly name = 'YouTubeSource';

  constructor(private readonly apiKey?: string) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async findSources(
    artist: string,
    title: string,
    versionType: VersionType
  ): Promise<SourceCandidate[]> {
    if (!this.apiKey) {
      return [];
    }

    const versionTag = versionType !== VersionType.STANDARD ? ` ${versionType}` : ' audio';
    const query = `${artist} ${title}${versionTag}`;

    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as YouTubeSearchResponse;
      const candidates: SourceCandidate[] = [];

      for (const item of data.items ?? []) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;

        candidates.push({
          video_id: videoId,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
          title: item.snippet?.title ?? `${artist} - ${title}`,
          channel_title: item.snippet?.channelTitle,
        });
      }

      return candidates;
    } catch {
      return [];
    }
  }

  async getSourceByUrl(rawUrl: string): Promise<SourceCandidate | null> {
    const validation = validateYouTubeUrl(rawUrl);
    if (!validation.isValid || !validation.videoId || !validation.canonicalUrl) {
      return null;
    }

    const videoId = validation.videoId;
    const canonicalUrl = validation.canonicalUrl;

    if (!this.apiKey) {
      // Offline fallback: return standard metadata structure with canonical URL
      return {
        video_id: videoId,
        youtube_url: canonicalUrl,
        title: `YouTube Video (${videoId})`,
      };
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          video_id: videoId,
          youtube_url: canonicalUrl,
          title: `YouTube Video (${videoId})`,
        };
      }

      const data = (await response.json()) as YouTubeVideoListResponse;
      const item = data.items?.[0];

      return {
        video_id: videoId,
        youtube_url: canonicalUrl,
        title: item?.snippet?.title ?? `YouTube Video (${videoId})`,
        channel_title: item?.snippet?.channelTitle,
      };
    } catch {
      return {
        video_id: videoId,
        youtube_url: canonicalUrl,
        title: `YouTube Video (${videoId})`,
      };
    }
  }
}

import { MetadataProvider, MetadataCandidate } from './metadata_provider.js';
import { SourceProvider } from './source_provider.js';
import { CandidateRanker, ScoredCandidate, UnrankedCandidate } from './candidate_ranker.js';
import { detectVersionType, parseArtistAndTitle, stripVideoClutter } from '../domain/normalization.js';
import { validateYouTubeUrl } from '../validation/youtube_url.js';
import { VersionType } from '../domain/version_type.js';

export interface SearchOptions {
  requestedVersion?: VersionType;
  maxCandidates?: number;
}

export class SearchService {
  private readonly ranker = new CandidateRanker();

  constructor(
    private readonly metadataProviders: MetadataProvider[],
    private readonly sourceProvider: SourceProvider
  ) {}

  /**
   * Dispatches free text query or direct YouTube URL to appropriate search flow.
   */
  async search(query: string, options: SearchOptions = {}): Promise<ScoredCandidate[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // 1. Direct YouTube link check
    const ytValidation = validateYouTubeUrl(trimmed);
    if (ytValidation.isValid && ytValidation.canonicalUrl) {
      return this.handleDirectYouTubeUrl(trimmed, ytValidation.canonicalUrl);
    }

    // 2. Free text search
    return this.handleTextSearch(trimmed, options);
  }

  private async handleDirectYouTubeUrl(
    _rawUrl: string,
    canonicalUrl: string
  ): Promise<ScoredCandidate[]> {
    const sourceInfo = await this.sourceProvider.getSourceByUrl(canonicalUrl);
    const videoTitle = sourceInfo?.title ?? 'Unknown Video';
    const parsed = parseArtistAndTitle(videoTitle);
    const version = detectVersionType(videoTitle);

    const artist = parsed ? parsed.artist : sourceInfo?.channel_title ?? 'Unknown Artist';
    const title = parsed ? stripVideoClutter(parsed.title) : stripVideoClutter(videoTitle);
    const videoId = sourceInfo?.video_id ?? 'unknown';

    return [
      {
        artist,
        title,
        version_type: version,
        youtube_url: canonicalUrl,
        video_id: videoId,
        score: 100,
        match_reasons: ['direct_youtube_url'],
      },
    ];
  }

  private async handleTextSearch(
    query: string,
    options: SearchOptions
  ): Promise<ScoredCandidate[]> {
    const requestedVersion = options.requestedVersion ?? detectVersionType(query);
    const maxResults = options.maxCandidates ?? 3;

    // 1. Resolve canonical metadata from available metadata providers (Spotify first, then YouTube)
    let metaCandidates: MetadataCandidate[] = [];
    for (const provider of this.metadataProviders) {
      if (provider.isAvailable()) {
        const results = await provider.resolveMetadata(query);
        if (results.length > 0) {
          metaCandidates = results;
          break; // Primary provider succeeded
        }
      }
    }

    // If metadata providers gave no results, synthesize candidate from query itself
    if (metaCandidates.length === 0) {
      const parsed = parseArtistAndTitle(query);
      if (parsed) {
        metaCandidates = [
          {
            artist: parsed.artist,
            title: parsed.title,
            version_type: requestedVersion,
            confidence: 0.6,
          },
        ];
      } else {
        metaCandidates = [
          {
            artist: '',
            title: query,
            version_type: requestedVersion,
            confidence: 0.4,
          },
        ];
      }
    }

    // 2. Query source provider (YouTube) for audio candidates
    const unranked: UnrankedCandidate[] = [];

    for (const meta of metaCandidates.slice(0, 3)) {
      const sources = await this.sourceProvider.findSources(
        meta.artist,
        meta.title,
        meta.version_type || requestedVersion
      );

      for (const src of sources) {
        unranked.push({
          artist: meta.artist || src.channel_title || 'Unknown Artist',
          title: meta.title,
          version_type: meta.version_type || requestedVersion,
          youtube_url: src.youtube_url,
          video_id: src.video_id,
          raw_source_title: src.title,
          channel_title: src.channel_title,
          view_count: src.view_count,
        });
      }
    }

    // 3. Score and rank candidates deterministically
    return this.ranker.rankCandidates(query, unranked, requestedVersion, maxResults);
  }
}

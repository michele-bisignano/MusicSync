import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../../src/search/search_service.js';
import { MetadataProvider, MetadataCandidate } from '../../src/search/metadata_provider.js';
import { SourceProvider, SourceCandidate } from '../../src/search/source_provider.js';
import { VersionType } from '../../src/domain/version_type.js';

describe('SearchService', () => {
  const mockSpotifyProvider: MetadataProvider = {
    name: 'SpotifyMock',
    isAvailable: vi.fn().mockReturnValue(true),
    resolveMetadata: vi.fn().mockResolvedValue([
      {
        artist: 'Pinguini Tattici Nucleari',
        title: 'Pastello Bianco',
        version_type: VersionType.STANDARD,
        confidence: 0.95,
      },
    ] as MetadataCandidate[]),
  };

  const mockYouTubeSearchProvider: MetadataProvider = {
    name: 'YouTubeSearchMock',
    isAvailable: vi.fn().mockReturnValue(true),
    resolveMetadata: vi.fn().mockResolvedValue([
      {
        artist: 'Pinguini Tattici Nucleari',
        title: 'Pastello Bianco',
        version_type: VersionType.STANDARD,
        confidence: 0.7,
      },
    ] as MetadataCandidate[]),
  };

  const mockSourceProvider: SourceProvider = {
    name: 'YouTubeSourceMock',
    isAvailable: vi.fn().mockReturnValue(true),
    findSources: vi.fn().mockResolvedValue([
      {
        video_id: 'abc12345678',
        youtube_url: 'https://www.youtube.com/watch?v=abc12345678',
        title: 'Pinguini Tattici Nucleari - Pastello Bianco (Official Video)',
        channel_title: 'PinguiniVEVO',
      },
    ] as SourceCandidate[]),
    getSourceByUrl: vi.fn().mockResolvedValue({
      video_id: 'xyz98765432',
      youtube_url: 'https://www.youtube.com/watch?v=xyz98765432',
      title: 'Queen - Bohemian Rhapsody',
      channel_title: 'Queen Official',
    } as SourceCandidate),
  };

  it('uses primary metadata provider (Spotify) when available and resolves sources', () => {
    const service = new SearchService(
      [mockSpotifyProvider, mockYouTubeSearchProvider],
      mockSourceProvider
    );

    return service.search('pastello bianco pinguini').then((results) => {
      expect(mockSpotifyProvider.resolveMetadata).toHaveBeenCalledWith('pastello bianco pinguini');
      expect(mockYouTubeSearchProvider.resolveMetadata).not.toHaveBeenCalled(); // primary succeeded
      expect(results.length).toBe(1);
      expect(results[0].artist).toBe('Pinguini Tattici Nucleari');
      expect(results[0].title).toBe('Pastello Bianco');
      expect(results[0].youtube_url).toBe('https://www.youtube.com/watch?v=abc12345678');
    });
  });

  it('falls back to YouTube search metadata provider when Spotify is unavailable', () => {
    const unavailableSpotify: MetadataProvider = {
      name: 'SpotifyUnavailable',
      isAvailable: vi.fn().mockReturnValue(false),
      resolveMetadata: vi.fn(),
    };

    const service = new SearchService(
      [unavailableSpotify, mockYouTubeSearchProvider],
      mockSourceProvider
    );

    return service.search('pastello bianco').then((results) => {
      expect(unavailableSpotify.resolveMetadata).not.toHaveBeenCalled();
      expect(mockYouTubeSearchProvider.resolveMetadata).toHaveBeenCalledWith('pastello bianco');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Pastello Bianco');
    });
  });

  it('handles direct YouTube URLs without calling metadata providers', () => {
    const service = new SearchService(
      [mockSpotifyProvider, mockYouTubeSearchProvider],
      mockSourceProvider
    );

    return service.search('https://www.youtube.com/watch?v=xyz98765432').then((results) => {
      expect(mockSourceProvider.getSourceByUrl).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=xyz98765432'
      );
      expect(results.length).toBe(1);
      expect(results[0].artist).toBe('Queen');
      expect(results[0].title).toBe('Bohemian Rhapsody');
      expect(results[0].youtube_url).toBe('https://www.youtube.com/watch?v=xyz98765432');
    });
  });
});

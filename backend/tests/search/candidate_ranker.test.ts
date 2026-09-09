import { describe, it, expect } from 'vitest';
import { CandidateRanker, UnrankedCandidate } from '../../src/search/candidate_ranker.js';
import { VersionType } from '../../src/domain/version_type.js';

describe('CandidateRanker', () => {
  const ranker = new CandidateRanker();

  it('ranks exact match higher than partial match', () => {
    const query = 'Pastello Bianco Pinguini Tattici Nucleari';
    const candidates: UnrankedCandidate[] = [
      {
        artist: 'Pinguini Tattici Nucleari',
        title: 'Ringo Starr',
        youtube_url: 'https://www.youtube.com/watch?v=11111111111',
        video_id: '11111111111',
      },
      {
        artist: 'Pinguini Tattici Nucleari',
        title: 'Pastello Bianco',
        youtube_url: 'https://www.youtube.com/watch?v=22222222222',
        video_id: '22222222222',
      },
    ];

    const ranked = ranker.rankCandidates(query, candidates, VersionType.STANDARD);
    expect(ranked.length).toBe(2);
    expect(ranked[0].title).toBe('Pastello Bianco');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('penalizes live versions when standard version is requested', () => {
    const query = 'Comfortably Numb Pink Floyd';
    const candidates: UnrankedCandidate[] = [
      {
        artist: 'Pink Floyd',
        title: 'Comfortably Numb',
        version_type: VersionType.LIVE,
        raw_source_title: 'Pink Floyd - Comfortably Numb (Live at Pulse)',
        youtube_url: 'https://www.youtube.com/watch?v=live1111111',
        video_id: 'live1111111',
      },
      {
        artist: 'Pink Floyd',
        title: 'Comfortably Numb',
        version_type: VersionType.STANDARD,
        raw_source_title: 'Pink Floyd - Comfortably Numb (Official Audio)',
        youtube_url: 'https://www.youtube.com/watch?v=std22222222',
        video_id: 'std22222222',
      },
    ];

    const ranked = ranker.rankCandidates(query, candidates, VersionType.STANDARD);
    expect(ranked[0].version_type).toBe(VersionType.STANDARD);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('limits results to at most maxResults (default 3)', () => {
    const candidates: UnrankedCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      artist: `Artist ${i}`,
      title: `Song ${i}`,
      youtube_url: `https://www.youtube.com/watch?v=vid0000000${i}`,
      video_id: `vid0000000${i}`,
    }));

    const ranked = ranker.rankCandidates('Song', candidates, VersionType.STANDARD, 3);
    expect(ranked.length).toBe(3);
  });
});

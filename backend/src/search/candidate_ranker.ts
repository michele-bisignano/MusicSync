import { VersionType } from '../domain/version_type.js';
import { calculateTokenOverlap, normalizeString, detectVersionType } from '../domain/normalization.js';

export interface ScoredCandidate {
  artist: string;
  title: string;
  version_type: VersionType;
  youtube_url: string;
  video_id: string;
  score: number;
  match_reasons: string[];
}

export interface UnrankedCandidate {
  artist: string;
  title: string;
  version_type?: VersionType;
  youtube_url: string;
  video_id: string;
  raw_source_title?: string;
  channel_title?: string;
  view_count?: number;
}

export class CandidateRanker {
  /**
   * Scores and ranks candidates deterministically based on query relevance,
   * token overlap, and version compatibility.
   */
  rankCandidates(
    query: string,
    candidates: UnrankedCandidate[],
    requestedVersion: VersionType = VersionType.STANDARD,
    maxResults = 3
  ): ScoredCandidate[] {
    const normalizedQuery = normalizeString(query);

    const scored = candidates.map((candidate) => {
      let score = 0;
      const reasons: string[] = [];

      const candidateTitle = candidate.title;
      const candidateArtist = candidate.artist;
      const candidateVersion =
        candidate.version_type ??
        (candidate.raw_source_title ? detectVersionType(candidate.raw_source_title) : VersionType.STANDARD);

      const combinedText = `${candidateArtist} ${candidateTitle}`;
      const normalizedCombined = normalizeString(combinedText);

      // 1. Exact string match on artist + title
      if (normalizedCombined === normalizedQuery) {
        score += 50;
        reasons.push('exact_match');
      } else if (normalizedCombined.includes(normalizedQuery) || normalizedQuery.includes(normalizedCombined)) {
        score += 30;
        reasons.push('substring_match');
      }

      // 2. Token overlap between query and artist + title
      const overlap = calculateTokenOverlap(normalizedQuery, normalizedCombined);
      const overlapScore = Math.round(overlap * 40);
      score += overlapScore;
      if (overlapScore > 0) {
        reasons.push(`token_overlap_${overlapScore}`);
      }

      // 3. Artist match check
      const normalizedArtist = normalizeString(candidateArtist);
      if (normalizedArtist && normalizedQuery.includes(normalizedArtist)) {
        score += 15;
        reasons.push('artist_match');
      }

      // 4. Version compatibility
      if (candidateVersion === requestedVersion) {
        score += 20;
        reasons.push('version_match');
      } else if (requestedVersion === VersionType.STANDARD && candidateVersion === VersionType.LIVE) {
        // Severe penalty: Live versions must not substitute for standard studio tracks
        score -= 40;
        reasons.push('penalty_unrequested_live');
      } else if (candidateVersion !== requestedVersion) {
        score -= 15;
        reasons.push('penalty_version_mismatch');
      }

      // 5. Raw source title video clutter / live check
      if (candidate.raw_source_title) {
        const detectedInSource = detectVersionType(candidate.raw_source_title);
        if (requestedVersion === VersionType.STANDARD && detectedInSource === VersionType.LIVE) {
          score -= 30;
          reasons.push('penalty_live_in_video_title');
        }
      }

      return {
        artist: candidateArtist,
        title: candidateTitle,
        version_type: candidateVersion,
        youtube_url: candidate.youtube_url,
        video_id: candidate.video_id,
        score,
        match_reasons: reasons,
      };
    });

    // Sort descending by score; on tie, sort alphabetically by title for determinism
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });

    return scored.slice(0, maxResults);
  }
}

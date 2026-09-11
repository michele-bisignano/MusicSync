import { VersionType } from './version_type.js';

/**
 * Normalizes a string by:
 * - Converting to lowercase
 * - Stripping diacritics/accents (NFD normalization)
 * - Replacing punctuation and special symbols with spaces
 * - Collapsing multiple consecutive spaces into a single space
 * - Trimming leading/trailing whitespace
 */
export function normalizeString(text: string): string {
  if (!text) return '';

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accent marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Replace non-alphanumeric with spaces
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim();
}

/**
 * Video clutter keywords commonly found in YouTube and music streaming titles.
 */
const CLUTTER_PATTERNS: RegExp[] = [
  /\((?:official\s+)?(?:music\s+)?video\)/gi,
  /\[(?:official\s+)?(?:music\s+)?video\]/gi,
  /\((?:official\s+)?audio\)/gi,
  /\[(?:official\s+)?audio\]/gi,
  /\((?:official\s+)?lyric(?:s)?(?:\s+video)?\)/gi,
  /\[(?:official\s+)?lyric(?:s)?(?:\s+video)?\]/gi,
  /\(videoclip\s+ufficiale\)/gi,
  /\[videoclip\s+ufficiale\]/gi,
  /\((?:hd|4k|hq|remastered|visualizer)\)/gi,
  /\[(?:hd|4k|hq|remastered|visualizer)\]/gi,
  /\b(?:official\s+video|official\s+music\s+video|official\s+audio|lyric\s+video)\b/gi,
  /\b(?:video\s+ufficiale|testo)\b/gi,
];

/**
 * Strips presentation clutter (like "Official Video", "Lyrics") from a title
 * while preserving version markers.
 */
export function stripVideoClutter(title: string): string {
  if (!title) return '';

  let cleaned = title;
  for (const pattern of CLUTTER_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Detects the version type from a title or raw query.
 * Distinguishes: standard, cover, remix, acoustic, live.
 */
export function detectVersionType(text: string): VersionType {
  const lower = text.toLowerCase();

  // Acoustic / Unplugged
  if (/\b(?:acoustic|acustica|acustico|unplugged)\b/i.test(lower)) {
    return VersionType.ACOUSTIC;
  }

  // Remix / Club Mix / VIP
  if (
    /\b(?:remix|club\s+mix|extended\s+mix|vip\s+mix|original\s+mix|summer\s+mix|dance\s+mix|dub\s+mix|radio\s+mix)\b/i.test(lower) ||
    /[([][^\])]*\bmix\b[^\])]*[)\]]/i.test(lower)
  ) {
    return VersionType.REMIX;
  }

  // Cover / Tribute
  if (/\b(?:cover|tribute|suonata\s+da)\b/i.test(lower)) {
    return VersionType.COVER;
  }

  // Live / Dal Vivo / In Concerto
  if (/\b(?:live|dal\s+vivo|in\s+concerto|live\s+at|at\s+wembley)\b/i.test(lower)) {
    return VersionType.LIVE;
  }

  return VersionType.STANDARD;
}

/**
 * Attempts to parse "Artist - Title" patterns from common video titles or queries.
 */
export function parseArtistAndTitle(raw: string): { artist: string; title: string } | null {
  const cleaned = stripVideoClutter(raw);

  // Common separators: " - ", " – ", " — ", " : "
  const separatorMatch = cleaned.match(/\s+[-–—:]\s+/);
  if (separatorMatch && separatorMatch.index !== undefined) {
    const artist = cleaned.substring(0, separatorMatch.index).trim();
    const title = cleaned.substring(separatorMatch.index + separatorMatch[0].length).trim();

    if (artist.length > 0 && title.length > 0) {
      return { artist, title };
    }
  }

  return null;
}

/**
 * Calculates token overlap score (Jaccard similarity on normalized word tokens)
 * between two strings. Returns a value between 0.0 and 1.0.
 */
export function calculateTokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeString(a).split(' ').filter((t) => t.length > 0));
  const tokensB = new Set(normalizeString(b).split(' ').filter((t) => t.length > 0));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Cleans YouTube channel names (e.g. "- Topic", "VEVO") to extract canonical artist name.
 */
export function cleanArtistName(raw?: string | null): string {
  if (!raw) return 'Artista Sconosciuto';
  let cleaned = raw.replace(/\s*-\s*Topic$/i, '').trim();
  cleaned = cleaned.replace(/(?<=[a-zA-Z0-9])VEVO$/i, '').trim();
  return cleaned.length > 0 ? cleaned : 'Artista Sconosciuto';
}

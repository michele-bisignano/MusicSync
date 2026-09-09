export interface YouTubeValidationResult {
  isValid: boolean;
  videoId?: string;
  canonicalUrl?: string;
  error?: string;
}

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Validates whether a raw string is a legitimate, genuine YouTube video URL.
 * Strictly prevents lookalike domains, credentials in URLs, and non-HTTP protocols.
 */
export function validateYouTubeUrl(rawUrl: string): YouTubeValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL mancante o vuoto' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, error: 'Formato URL non valido' };
  }

  // Enforce HTTP / HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Protocollo non supportato (solo HTTP/HTTPS)' };
  }

  // Reject credentials in URL (e.g. https://user:pass@youtube.com)
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'Credenziali non permesse nell\'URL' };
  }

  // Exact hostname matching (prevents evil.example/youtube.com or youtube.com.evil.com)
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    return { isValid: false, error: 'Dominio YouTube non consentito o lookalike' };
  }

  let videoId: string | null = null;

  if (hostname === 'youtu.be') {
    // Format: https://youtu.be/<videoId>
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 1) {
      videoId = pathParts[0];
    }
  } else {
    // Format: /watch?v=<videoId>
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (
      parsed.pathname.startsWith('/embed/') ||
      parsed.pathname.startsWith('/v/') ||
      parsed.pathname.startsWith('/shorts/')
    ) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        videoId = parts[1];
      }
    }
  }

  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
    return { isValid: false, error: 'ID video YouTube mancante o non valido' };
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return {
    isValid: true,
    videoId,
    canonicalUrl,
  };
}

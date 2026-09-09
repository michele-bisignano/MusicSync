import { describe, it, expect } from 'vitest';
import { validateYouTubeUrl } from '../../src/validation/youtube_url.js';

describe('YouTube URL Validation', () => {
  it('accepts standard https://www.youtube.com/watch?v= URLs', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('accepts short https://youtu.be/ URLs', () => {
    const res = validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('accepts mobile and music subdomains', () => {
    const mobile = validateYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(mobile.isValid).toBe(true);
    expect(mobile.videoId).toBe('dQw4w9WgXcQ');

    const music = validateYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(music.isValid).toBe(true);
    expect(music.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts YouTube shorts and embed URLs', () => {
    const shorts = validateYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(shorts.isValid).toBe(true);
    expect(shorts.videoId).toBe('dQw4w9WgXcQ');

    const embed = validateYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(embed.isValid).toBe(true);
    expect(embed.videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects lookalike domain attacks (e.g. evil subdomain or path disguise)', () => {
    const lookalike1 = validateYouTubeUrl('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
    expect(lookalike1.isValid).toBe(false);
    expect(lookalike1.error).toContain('non consentito');

    const lookalike2 = validateYouTubeUrl('https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ');
    expect(lookalike2.isValid).toBe(false);

    const lookalike3 = validateYouTubeUrl('https://fake-youtube.com/watch?v=dQw4w9WgXcQ');
    expect(lookalike3.isValid).toBe(false);
  });

  it('rejects URLs with credentials', () => {
    const creds = validateYouTubeUrl('https://admin:pass@www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(creds.isValid).toBe(false);
    expect(creds.error).toContain('Credenziali non permesse');
  });

  it('rejects non-HTTP protocols', () => {
    const ftp = validateYouTubeUrl('ftp://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(ftp.isValid).toBe(false);

    const js = validateYouTubeUrl('javascript:alert(1)');
    expect(js.isValid).toBe(false);
  });

  it('rejects invalid or malformed video IDs', () => {
    const shortId = validateYouTubeUrl('https://www.youtube.com/watch?v=abc');
    expect(shortId.isValid).toBe(false);

    const noId = validateYouTubeUrl('https://www.youtube.com/watch');
    expect(noId.isValid).toBe(false);
  });
});

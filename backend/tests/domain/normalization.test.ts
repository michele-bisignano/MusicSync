import { describe, it, expect } from 'vitest';
import {
  normalizeString,
  stripVideoClutter,
  detectVersionType,
  parseArtistAndTitle,
  calculateTokenOverlap,
} from '../../src/domain/normalization.js';
import { VersionType } from '../../src/domain/version_type.js';

describe('Domain Normalization', () => {
  describe('normalizeString', () => {
    it('lowercases and removes accents', () => {
      expect(normalizeString('Perché')).toBe('perche');
      expect(normalizeString('È stato un errore')).toBe('e stato un errore');
      expect(normalizeString('Señorita - Café')).toBe('senorita cafe');
    });

    it('strips punctuation and collapses whitespace', () => {
      expect(normalizeString('AC/DC: Back in Black!')).toBe('ac dc back in black');
      expect(normalizeString('   Song   with    many     spaces   ')).toBe('song with many spaces');
      expect(normalizeString('')).toBe('');
    });
  });

  describe('stripVideoClutter', () => {
    it('removes official video and audio tags', () => {
      expect(stripVideoClutter('Get Lucky (Official Video)')).toBe('Get Lucky');
      expect(stripVideoClutter('Daft Punk - Get Lucky [Official Music Video]')).toBe('Daft Punk - Get Lucky');
      expect(stripVideoClutter('Song Title (Official Audio)')).toBe('Song Title');
      expect(stripVideoClutter('Song Title [Official Audio]')).toBe('Song Title');
    });

    it('removes lyrics and visualizer tags', () => {
      expect(stripVideoClutter('Song Name (Lyrics)')).toBe('Song Name');
      expect(stripVideoClutter('Song Name [Lyric Video]')).toBe('Song Name');
      expect(stripVideoClutter('Song Name (Visualizer)')).toBe('Song Name');
      expect(stripVideoClutter('Canzone Bella (Videoclip Ufficiale)')).toBe('Canzone Bella');
    });

    it('preserves meaningful song titles without clutter', () => {
      expect(stripVideoClutter('The Beatles - Let It Be')).toBe('The Beatles - Let It Be');
    });
  });

  describe('detectVersionType', () => {
    it('detects acoustic versions', () => {
      expect(detectVersionType('Layla (Acoustic)')).toBe(VersionType.ACOUSTIC);
      expect(detectVersionType('Hotel California - Unplugged')).toBe(VersionType.ACOUSTIC);
      expect(detectVersionType('Versione Acustica')).toBe(VersionType.ACOUSTIC);
    });

    it('detects remixes', () => {
      expect(detectVersionType('Levitating (Remix feat. DaBaby)')).toBe(VersionType.REMIX);
      expect(detectVersionType('Titanium (David Guetta Club Mix)')).toBe(VersionType.REMIX);
      expect(detectVersionType('Original Extended Mix')).toBe(VersionType.REMIX);
    });

    it('detects covers', () => {
      expect(detectVersionType('Hurt (Johnny Cash Cover)')).toBe(VersionType.COVER);
      expect(detectVersionType('Tribute to Queen')).toBe(VersionType.COVER);
    });

    it('detects live recordings', () => {
      expect(detectVersionType('Comfortably Numb (Live at Pulse)')).toBe(VersionType.LIVE);
      expect(detectVersionType('Albachiara - Live dal vivo')).toBe(VersionType.LIVE);
      expect(detectVersionType('Queen Live at Wembley')).toBe(VersionType.LIVE);
    });

    it('defaults to standard for normal tracks', () => {
      expect(detectVersionType('Bohemian Rhapsody')).toBe(VersionType.STANDARD);
      expect(detectVersionType('Pastello Bianco')).toBe(VersionType.STANDARD);
    });
  });

  describe('parseArtistAndTitle', () => {
    it('parses hyphen separated artist and title', () => {
      const parsed = parseArtistAndTitle('Pink Floyd - Time (Official Audio)');
      expect(parsed).toEqual({
        artist: 'Pink Floyd',
        title: 'Time',
      });
    });

    it('parses em-dash and en-dash separators', () => {
      const parsed = parseArtistAndTitle('Coldplay – Yellow');
      expect(parsed).toEqual({
        artist: 'Coldplay',
        title: 'Yellow',
      });
    });

    it('returns null if no separator is found', () => {
      expect(parseArtistAndTitle('Pastello Bianco')).toBeNull();
    });
  });

  describe('calculateTokenOverlap', () => {
    it('returns 1.0 for identical sets of words', () => {
      expect(calculateTokenOverlap('Pink Floyd Time', 'time pink floyd')).toBe(1.0);
    });

    it('returns partial overlap for shared tokens', () => {
      const overlap = calculateTokenOverlap('Pastello Bianco Pinguini', 'Pinguini Tattici Nucleari Pastello Bianco');
      expect(overlap).toBeGreaterThan(0.4);
      expect(overlap).toBeLessThan(1.0);
    });

    it('returns 0 for completely disjoint tokens', () => {
      expect(calculateTokenOverlap('Coldplay Yellow', 'Metallica Enter Sandman')).toBe(0);
    });
  });
});

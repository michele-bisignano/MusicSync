import { describe, it, expect } from 'vitest';
import {
  formatHelpMessage,
  formatCandidateMessage,
  formatCandidateKeyboard,
  formatDirectYouTubeMessage,
  formatDirectYouTubeKeyboard,
  formatRemovePromptMessage,
  formatRemoveKeyboard,
  formatLibraryListMessages,
  parseCandidateFromMessage,
} from '../../src/telegram/telegram_formatter.js';
import { VersionType } from '../../src/domain/version_type.js';
import { Song, SongStatus } from '../../src/domain/song.js';

describe('Telegram Formatter', () => {
  it('formats help message with all commands in Italian', () => {
    const help = formatHelpMessage();
    expect(help).toContain('/aggiungi');
    expect(help).toContain('/rimuovi');
    expect(help).toContain('/lista');
    expect(help).toContain('/force');
    expect(help).toContain('/aiuto');
  });

  it('formats candidate message with index and details', () => {
    const candidate = {
      artist: 'Pink Floyd',
      title: 'Time',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=11111111111',
    };
    const msg = formatCandidateMessage(candidate, 1, 3);
    expect(msg).toContain('Pink Floyd');
    expect(msg).toContain('Time');
    expect(msg).toContain('standard');
    expect(msg).toContain('https://www.youtube.com/watch?v=11111111111');
    expect(msg).toContain('(1 di 3)');
  });

  it('formats candidate keyboard with next callback data', () => {
    const kbWithNext = formatCandidateKeyboard(['vid2', 'vid3']);
    expect(kbWithNext.inline_keyboard[0][0].text).toBe('✅ È questa');
    expect(kbWithNext.inline_keyboard[0][0].callback_data).toBe('add:ok');
    expect(kbWithNext.inline_keyboard[0][1].text).toBe('❌ No');
    expect(kbWithNext.inline_keyboard[0][1].callback_data).toBe('next:vid2:vid3');

    const kbLast = formatCandidateKeyboard([]);
    expect(kbLast.inline_keyboard[0][1].callback_data).toBe('next:none');
  });

  it('formats direct YouTube message and keyboard', () => {
    const msg = formatDirectYouTubeMessage(
      'Queen',
      'Bohemian Rhapsody',
      VersionType.STANDARD,
      'https://www.youtube.com/watch?v=22222222222'
    );
    expect(msg).toContain('Queen');
    expect(msg).toContain('Bohemian Rhapsody');
    expect(msg).toContain('https://www.youtube.com/watch?v=22222222222');

    const kb = formatDirectYouTubeKeyboard();
    expect(kb.inline_keyboard[0][0].text).toContain('Aggiungi');
    expect(kb.inline_keyboard[0][0].callback_data).toBe('add:ok');
    expect(kb.inline_keyboard[0][1].callback_data).toBe('add:cancel');
  });

  it('formats removal prompt message and keyboard', () => {
    const song: Song = {
      id: 42,
      artist: 'Coldplay',
      title: 'Yellow',
      normalized_artist: 'coldplay',
      normalized_title: 'yellow',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=11111111111',
      status: SongStatus.ACTIVE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const msg = formatRemovePromptMessage(song);
    expect(msg).toContain('Yellow');
    expect(msg).toContain('Coldplay');

    const kb = formatRemoveKeyboard(42);
    expect(kb.inline_keyboard[0][0].callback_data).toBe('rem:ok:42');
    expect(kb.inline_keyboard[0][1].callback_data).toBe('rem:cancel');
  });

  it('formats empty library list message', () => {
    const msgs = formatLibraryListMessages([]);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('vuota');
  });

  it('formats populated library list messages and chunks if long', () => {
    const songs: Song[] = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      artist: `Artist Very Long Name Number ${i + 1}`,
      title: `Song Super Ultra Long Title Track Edition Deluxe Special ${i + 1}`,
      normalized_artist: `artist ${i + 1}`,
      normalized_title: `song ${i + 1}`,
      version_type: VersionType.STANDARD,
      youtube_url: `https://www.youtube.com/watch?v=vid_${i + 1}`,
      status: SongStatus.ACTIVE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const msgs = formatLibraryListMessages(songs);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    for (const m of msgs) {
      expect(m.length).toBeLessThanOrEqual(4000);
    }
  });

  it('parses candidate message back into structured data', () => {
    const rawText =
      `🎵 *Risultato trovato (1 di 3)*:\n\n` +
      `👤 *Artista*: Daft Punk\n` +
      `🎶 *Titolo*: Get Lucky\n` +
      `💿 *Versione*: remix\n` +
      `🔗 https://www.youtube.com/watch?v=5NV6Rdv1a3I\n\n` +
      `È questa la canzone che desideri aggiungere?`;

    const parsed = parseCandidateFromMessage(rawText);
    expect(parsed).not.toBeNull();
    expect(parsed?.artist).toBe('Daft Punk');
    expect(parsed?.title).toBe('Get Lucky');
    expect(parsed?.version_type).toBe(VersionType.REMIX);
    expect(parsed?.youtube_url).toBe('https://www.youtube.com/watch?v=5NV6Rdv1a3I');
  });
});

import { VersionType } from '../domain/version_type.js';
import { Song } from '../domain/song.js';
import { InlineKeyboardMarkup } from './telegram_types.js';
import { ScoredCandidate } from '../search/candidate_ranker.js';

export interface ParsedCandidateMessage {
  artist: string;
  title: string;
  version_type: VersionType;
  youtube_url: string;
}

/**
 * Escapes special characters for Telegram Markdown v1: _, *, `, [
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

/**
 * Escapes URL for display in Telegram Markdown v1.
 * Bare URLs with underscores will cause parse errors in Markdown v1 unless escaped.
 */
export function escapeUrlMarkdown(url: string): string {
  return url.replace(/([_*`\[])/g, '\\$1');
}

export function formatHelpMessage(): string {
  return (
    `🎵 *Benvenuto in MusicSync!*\n\n` +
    `Gestisci la tua libreria musicale da sincronizzare sulla chiavetta USB.\n\n` +
    `*Comandi disponibili:*\n` +
    `• \`/aggiungi <canzone>\` — Cerca e propone fino a 3 risultati con pulsanti di conferma.\n` +
    `• Incolla un link YouTube — Identifica il brano e chiede conferma.\n` +
    `• \`/force <link_youtube>\` — Forza l'aggiunta o aggiorna la sorgente del brano.\n` +
    `• \`/rimuovi <canzone>\` — Cerca tra i brani attivi e chiede conferma per rimuoverlo.\n` +
    `• \`/lista\` — Visualizza l'elenco dei brani attivi nella libreria.\n` +
    `• \`/aiuto\` — Mostra questa guida.\n\n` +
    `_Consiglio: Puoi anche scrivere direttamente il titolo o autore senza premettere alcun comando!_`
  );
}

export function formatCandidateMessage(
  candidate: ScoredCandidate | { artist: string; title: string; version_type: VersionType; youtube_url: string },
  index: number,
  total: number
): string {
  return (
    `🎵 *Risultato trovato (${index} di ${total})*:\n\n` +
    `👤 *Artista*: ${escapeMarkdown(candidate.artist)}\n` +
    `🎶 *Titolo*: ${escapeMarkdown(candidate.title)}\n` +
    `💿 *Versione*: ${escapeMarkdown(candidate.version_type)}\n` +
    `🔗 ${escapeUrlMarkdown(candidate.youtube_url)}\n\n` +
    `È questa la canzone che desideri aggiungere?`
  );
}

export function formatCandidateKeyboard(
  remainingVideoIds: string[],
  currentIndex?: number,
  total?: number
): InlineKeyboardMarkup {
  let nextCallbackData: string;
  if (remainingVideoIds.length === 0) {
    nextCallbackData = 'next:none';
  } else if (currentIndex !== undefined && total !== undefined) {
    nextCallbackData = `next:${currentIndex}:${total}:${remainingVideoIds.join(':')}`;
  } else {
    nextCallbackData = `next:${remainingVideoIds.join(':')}`;
  }

  return {
    inline_keyboard: [
      [
        { text: '✅ È questa', callback_data: 'add:ok' },
        { text: '❌ No', callback_data: nextCallbackData },
      ],
    ],
  };
}

export function formatDirectYouTubeMessage(
  artist: string,
  title: string,
  version_type: VersionType,
  youtube_url: string
): string {
  return (
    `🎵 *Brano identificato da YouTube*:\n\n` +
    `👤 *Artista*: ${escapeMarkdown(artist)}\n` +
    `🎶 *Titolo*: ${escapeMarkdown(title)}\n` +
    `💿 *Versione*: ${escapeMarkdown(version_type)}\n` +
    `🔗 ${escapeUrlMarkdown(youtube_url)}\n\n` +
    `Vuoi aggiungere questo brano alla tua libreria?`
  );
}

export function formatDirectYouTubeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aggiungi alla libreria', callback_data: 'add:ok' },
        { text: '❌ Annulla', callback_data: 'add:cancel' },
      ],
    ],
  };
}

export function formatRemovePromptMessage(song: Song): string {
  return (
    `⚠️ *Conferma rimozione*:\n\n` +
    `👤 *Artista*: ${escapeMarkdown(song.artist)}\n` +
    `🎶 *Titolo*: ${escapeMarkdown(song.title)}\n` +
    `💿 *Versione*: ${escapeMarkdown(song.version_type)}\n\n` +
    `Sei sicuro di voler rimuovere questo brano dalla libreria attiva?`
  );
}

export function formatRemoveKeyboard(songId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🗑️ Conferma rimozione', callback_data: `rem:ok:${songId}` },
        { text: '❌ Annulla', callback_data: 'rem:cancel' },
      ],
    ],
  };
}

export function formatLibraryListMessages(songs: Song[]): string[] {
  if (songs.length === 0) {
    return ['📚 La tua libreria musicale è vuota.\nUsa `/aggiungi` per cercare e aggiungere canzoni!'];
  }

  const header = `📚 *Libreria Musicale (${songs.length} brani attivi)*:\n\n`;
  const chunks: string[] = [];
  let currentChunk = header;

  songs.forEach((s, idx) => {
    const versionLabel = s.version_type !== VersionType.STANDARD ? ` (${escapeMarkdown(s.version_type)})` : '';
    const line = `${idx + 1}. *${escapeMarkdown(s.artist)}* — ${escapeMarkdown(s.title)}${versionLabel}\n`;

    // Max Telegram message length is 4096 characters. Keep margin.
    if (currentChunk.length + line.length > 3800) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += line;
  });

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function parseCandidateFromMessage(text: string | undefined): ParsedCandidateMessage | null {
  if (!text) return null;

  const artistMatch = text.match(/👤\s*\*?Artista\*?:\s*(.+)$/m);
  const titleMatch = text.match(/🎶\s*\*?Titolo\*?:\s*(.+)$/m);
  const versionMatch = text.match(/💿\s*\*?Versione\*?:\s*(.+)$/m);
  const urlMatch = text.match(/🔗\s*(https?:\/\/[^\s]+)/m);

  if (!artistMatch || !titleMatch || !urlMatch) {
    return null;
  }

  const artist = artistMatch[1].replace(/\\/g, '').trim();
  const title = titleMatch[1].replace(/\\/g, '').trim();
  const rawVersion = versionMatch ? versionMatch[1].replace(/\\/g, '').trim().toLowerCase() : 'standard';
  const youtube_url = urlMatch[1].replace(/\\/g, '').trim();

  let version_type = VersionType.STANDARD;
  if (rawVersion.includes('cover')) version_type = VersionType.COVER;
  else if (rawVersion.includes('remix')) version_type = VersionType.REMIX;
  else if (rawVersion.includes('acoustic') || rawVersion.includes('acustica')) version_type = VersionType.ACOUSTIC;
  else if (rawVersion.includes('live')) version_type = VersionType.LIVE;

  return {
    artist,
    title,
    version_type,
    youtube_url,
  };
}

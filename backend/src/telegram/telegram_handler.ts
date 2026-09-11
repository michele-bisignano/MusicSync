import { ITelegramClient } from './telegram_client.js';
import { TelegramAuthorizer } from './telegram_authorizer.js';
import { TelegramUpdate } from './telegram_types.js';
import { SearchService } from '../search/search_service.js';
import { SourceProvider } from '../search/source_provider.js';
import { LibraryService } from '../library/library_service.js';
import { validateYouTubeUrl } from '../validation/youtube_url.js';
import { Song } from '../domain/song.js';
import {
  stripVideoClutter,
  detectVersionType,
  parseArtistAndTitle,
  calculateTokenOverlap,
  cleanArtistName,
} from '../domain/normalization.js';
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
  escapeMarkdown,
} from './telegram_formatter.js';
import { VersionType } from '../domain/version_type.js';

export class TelegramBotHandler {
  constructor(
    private readonly telegramClient: ITelegramClient,
    private readonly authorizer: TelegramAuthorizer,
    private readonly searchService: SearchService,
    private readonly sourceProvider: SourceProvider,
    private readonly libraryService: LibraryService
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const user = update.message?.from ?? update.callback_query?.from;
    if (!this.authorizer.isAuthorized(user?.id, user?.username)) {
      // Structured log already written by authorizer; silently ignore unauthorized request
      return;
    }

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }
  }

  private async handleCallbackQuery(
    query: NonNullable<TelegramUpdate['callback_query']>
  ): Promise<void> {
    const data = query.data;
    const message = query.message;
    const chatId = message?.chat.id;
    const messageId = message?.message_id;

    if (!data || !chatId || !messageId) {
      await this.telegramClient.answerCallbackQuery(query.id);
      return;
    }

    // 1. Confirm candidate addition
    if (data === 'add:ok') {
      const parsed = parseCandidateFromMessage(message.text);
      if (!parsed) {
        await this.telegramClient.answerCallbackQuery(
          query.id,
          'Dati brano non validi o scaduti',
          true
        );
        return;
      }

      const res = await this.libraryService.addSong({
        artist: parsed.artist,
        title: parsed.title,
        version_type: parsed.version_type,
        youtube_url: parsed.youtube_url,
      });

      await this.telegramClient.answerCallbackQuery(query.id, 'Operazione completata!');

      let confirmationText = '';
      if (res.status === 'added') {
        confirmationText = `✅ *Aggiunto alla libreria*:\n"${res.song.artist} — ${res.song.title}" (${res.song.version_type})`;
      } else if (res.status === 'reactivated') {
        confirmationText = `🔄 *Brano riattivato nella libreria*:\n"${res.song.artist} — ${res.song.title}" (${res.song.version_type})`;
      } else {
        confirmationText = `ℹ️ *Già presente*: Il brano "${res.song.artist} — ${res.song.title}" è già attivo nella libreria.`;
      }

      await this.telegramClient.editMessageText(chatId, messageId, confirmationText, {
        parse_mode: 'Markdown',
      });
      return;
    }

    // 2. Cancel addition
    if (data === 'add:cancel') {
      await this.telegramClient.answerCallbackQuery(query.id, 'Annullato');
      await this.telegramClient.editMessageText(chatId, messageId, 'Operazione annullata.');
      return;
    }

    // 3. Reject candidate, request next (format: next:index:total:vid1:vid2... or next:vid1:vid2... or next:none)
    if (data.startsWith('next:')) {
      await this.telegramClient.answerCallbackQuery(query.id);
      const parts = data.slice(5).split(':').filter(Boolean);

      if (parts.length === 0 || parts[0] === 'none') {
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          '❌ *Nessun altro candidato disponibile*.\n\nProva a descrivere il brano in modo più preciso oppure incolla direttamente il link di YouTube.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let currentIndex = 2;
      let total = 3;
      let nextVideoId = parts[0];
      let remainingIds = parts.slice(1);

      if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        currentIndex = parseInt(parts[0], 10);
        total = parseInt(parts[1], 10);
        nextVideoId = parts[2];
        remainingIds = parts.slice(3);
      } else if (parts.length >= 1) {
        currentIndex = 2;
        total = parts.length + 1;
        nextVideoId = parts[0];
        remainingIds = parts.slice(1);
      }

      const nextUrl = `https://www.youtube.com/watch?v=${nextVideoId}`;

      try {
        const source = await this.sourceProvider.getSourceByUrl(nextUrl);
        if (!source) {
          throw new Error('Candidato non trovato su YouTube');
        }
        const parsed = parseArtistAndTitle(source.title);
        const version_type = detectVersionType(source.title);
        const artist = parsed?.artist || cleanArtistName(source.channel_title) || 'Artista Sconosciuto';
        const title = parsed?.title || stripVideoClutter(source.title);

        const nextMessage = formatCandidateMessage(
          { artist, title, version_type, youtube_url: nextUrl },
          currentIndex,
          total
        );
        const nextKeyboard = formatCandidateKeyboard(remainingIds, currentIndex + 1, total);

        await this.telegramClient.editMessageText(chatId, messageId, nextMessage, {
          parse_mode: 'Markdown',
          reply_markup: nextKeyboard,
        });
      } catch (err) {
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          '❌ Errore nel recupero del prossimo candidato. Riprova con una ricerca più specifica.'
        );
      }
      return;
    }

    // 4. Confirm song removal (format: rem:ok:<songId>)
    if (data.startsWith('rem:ok:')) {
      await this.telegramClient.answerCallbackQuery(query.id, 'Rimosso!');
      const songId = Number(data.slice(7));
      if (!Number.isNaN(songId)) {
        await this.libraryService.removeSong(songId);
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          '🗑️ *Brano rimosso con successo dalla libreria attiva*.',
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    // 5. Cancel removal
    if (data === 'rem:cancel') {
      await this.telegramClient.answerCallbackQuery(query.id, 'Annullato');
      await this.telegramClient.editMessageText(chatId, messageId, 'Rimozione annullata.');
      return;
    }

    // Fallback for unrecognized callback data
    await this.telegramClient.answerCallbackQuery(query.id);
  }

  private async handleMessage(
    message: NonNullable<TelegramUpdate['message']>
  ): Promise<void> {
    const text = message.text?.trim();
    const chatId = message.chat.id;

    if (!text) {
      return;
    }

    // 1. /start, /aiuto, /help
    if (/^\/(start|aiuto|help)(\s|$)/i.test(text)) {
      await this.telegramClient.sendMessage(chatId, formatHelpMessage(), {
        parse_mode: 'Markdown',
      });
      return;
    }

    // 2. /lista, /list
    if (/^\/(lista|list)(\s|$)/i.test(text)) {
      const songs = await this.libraryService.listActiveSongs();
      const messages = formatLibraryListMessages(songs);
      for (const msg of messages) {
        await this.telegramClient.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
      return;
    }

    // 3. /force <youtube_url>
    if (/^\/force(\s|$)/i.test(text)) {
      const urlArg = text.replace(/^\/force\s*/i, '').trim();
      const urlCheck = validateYouTubeUrl(urlArg);
      if (!urlCheck.isValid || !urlCheck.canonicalUrl) {
        await this.telegramClient.sendMessage(
          chatId,
          '❌ *Link YouTube non valido*.\nUso corretto: `/force https://www.youtube.com/watch?v=...`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      try {
        const source = await this.sourceProvider.getSourceByUrl(urlCheck.canonicalUrl);
        if (!source) {
          throw new Error('Sorgente YouTube non trovata');
        }
        const parsed = parseArtistAndTitle(source.title);
        const version_type = detectVersionType(source.title);
        const artist = parsed?.artist || cleanArtistName(source.channel_title) || 'Artista Sconosciuto';
        const title = parsed?.title || stripVideoClutter(source.title);

        const res = await this.libraryService.forceAddSong({
          artist,
          title,
          version_type,
          youtube_url: urlCheck.canonicalUrl,
        });

        await this.telegramClient.sendMessage(
          chatId,
          `⚡ *Brano forzato/aggiornato con successo*:\n"${escapeMarkdown(res.song.artist)} — ${escapeMarkdown(res.song.title)}" (${escapeMarkdown(res.song.version_type)})`,
          { parse_mode: 'Markdown' }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.telegramClient.sendMessage(
          chatId,
          `❌ Impossibile recuperare il brano da YouTube: ${message}`
        );
      }
      return;
    }

    // 4. /rimuovi <query>, /remove <query>
    if (/^\/(rimuovi|remove)(\s|$)/i.test(text)) {
      const query = text.replace(/^\/(rimuovi|remove)\s*/i, '').trim();
      if (!query) {
        await this.telegramClient.sendMessage(
          chatId,
          'Specifica il titolo o l\'autore del brano da rimuovere, ad es:\n`/rimuovi Pastello Bianco`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const activeSongs = await this.libraryService.listActiveSongs();
      const match = this.findBestSongMatch(query, activeSongs);
      if (!match) {
        await this.telegramClient.sendMessage(
          chatId,
          `❌ Nessun brano corrispondente a "${query}" trovato nella libreria attiva.`
        );
        return;
      }

      await this.telegramClient.sendMessage(
        chatId,
        formatRemovePromptMessage(match),
        {
          parse_mode: 'Markdown',
          reply_markup: formatRemoveKeyboard(match.id),
        }
      );
      return;
    }

    // 5. /aggiungi <query>, /add <query> or Free Text
    let searchQuery = text;
    if (/^\/(aggiungi|add)\s*/i.test(text)) {
      searchQuery = text.replace(/^\/(aggiungi|add)\s*/i, '').trim();
    }

    if (!searchQuery) {
      await this.telegramClient.sendMessage(
        chatId,
        'Specifica un brano da cercare o un link YouTube, ad es:\n`/aggiungi Pastello Bianco Pinguini`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Check if query is a direct YouTube URL
    const ytCheck = validateYouTubeUrl(searchQuery);
    if (ytCheck.isValid && ytCheck.canonicalUrl) {
      try {
        const source = await this.sourceProvider.getSourceByUrl(ytCheck.canonicalUrl);
        if (!source) {
          throw new Error('Sorgente YouTube non trovata');
        }
        const parsed = parseArtistAndTitle(source.title);
        const version_type = detectVersionType(source.title);
        const artist = parsed?.artist || cleanArtistName(source.channel_title) || 'Artista Sconosciuto';
        const title = parsed?.title || stripVideoClutter(source.title);

        await this.telegramClient.sendMessage(
          chatId,
          formatDirectYouTubeMessage(artist, title, version_type, ytCheck.canonicalUrl),
          {
            parse_mode: 'Markdown',
            reply_markup: formatDirectYouTubeKeyboard(),
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.telegramClient.sendMessage(
          chatId,
          `❌ Impossibile analizzare il link YouTube: ${message}`
        );
      }
      return;
    }

    // Unstructured text search
    try {
      const candidates = await this.searchService.search(searchQuery, { maxCandidates: 3 });
      if (candidates.length === 0) {
        await this.telegramClient.sendMessage(
          chatId,
          `❌ Nessun risultato trovato per "*${escapeMarkdown(searchQuery)}*".\n\nProva a descrivere il brano in modo più preciso oppure incolla direttamente il link di YouTube.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const firstCandidate = candidates[0];
      const remainingVideoIds = candidates.slice(1).map((c) => c.video_id);

      const msg = formatCandidateMessage(firstCandidate, 1, candidates.length);
      const keyboard = formatCandidateKeyboard(remainingVideoIds, 2, candidates.length);

      await this.telegramClient.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.telegramClient.sendMessage(
        chatId,
        `❌ Si è verificato un errore durante la ricerca: ${message}`
      );
    }
  }

  private findBestSongMatch(query: string, songs: Song[]): Song | null {
    const trimmed = query.trim();
    const cleanNumQuery = trimmed.replace(/^#/, '');

    // 1. If query is a number (e.g. "1" or "#1"), resolve against 1-based list index or ID
    if (/^\d+$/.test(cleanNumQuery)) {
      const num = parseInt(cleanNumQuery, 10);
      // Check 1-based position as shown in /list (e.g. 1. Artist - Title)
      if (num >= 1 && num <= songs.length) {
        return songs[num - 1];
      }
      // Fallback: check if matches song.id directly
      const byId = songs.find((s) => s.id === num);
      if (byId) {
        return byId;
      }
    }

    const qLower = trimmed.toLowerCase();
    let bestMatch: Song | null = null;
    let highestScore = 0;

    for (const song of songs) {
      const full = `${song.artist} ${song.title}`.toLowerCase();
      if (full.includes(qLower)) {
        return song; // Direct substring match
      }

      const score = calculateTokenOverlap(trimmed, full);
      if (score > highestScore && score >= 0.4) {
        highestScore = score;
        bestMatch = song;
      }
    }

    return bestMatch;
  }
}

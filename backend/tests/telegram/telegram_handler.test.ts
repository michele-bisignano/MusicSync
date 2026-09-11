import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramBotHandler } from '../../src/telegram/telegram_handler.js';
import { TelegramAuthorizer } from '../../src/telegram/telegram_authorizer.js';
import { ITelegramClient } from '../../src/telegram/telegram_client.js';
import { SearchService } from '../../src/search/search_service.js';
import { SourceProvider } from '../../src/search/source_provider.js';
import { LibraryService } from '../../src/library/library_service.js';
import { D1SongRepository } from '../../src/persistence/song_repository.js';
import { D1SyncStateRepository } from '../../src/persistence/sync_state_repository.js';
import { createInMemoryD1Database } from '../persistence/d1_test_helper.js';
import { VersionType } from '../../src/domain/version_type.js';
import { TelegramUpdate } from '../../src/telegram/telegram_types.js';

describe('TelegramBotHandler', () => {
  let db: D1Database;
  let songRepo: D1SongRepository;
  let syncRepo: D1SyncStateRepository;
  let libraryService: LibraryService;
  let mockTelegramClient: ITelegramClient;
  let mockSearchService: SearchService;
  let mockSourceProvider: SourceProvider;
  let authorizer: TelegramAuthorizer;
  let handler: TelegramBotHandler;

  const AUTHORIZED_USER_ID = 12345;
  const UNAUTHORIZED_USER_ID = 99999;

  beforeEach(() => {
    db = createInMemoryD1Database();
    songRepo = new D1SongRepository(db);
    syncRepo = new D1SyncStateRepository(db);
    libraryService = new LibraryService(db, songRepo, syncRepo);

    mockTelegramClient = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 101, chat: { id: 12345, type: 'private' }, date: 12345 }),
      editMessageText: vi.fn().mockResolvedValue({ message_id: 101, chat: { id: 12345, type: 'private' }, date: 12345 }),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
    };

    mockSourceProvider = {
      name: 'MockYouTubeSource',
      isAvailable: vi.fn().mockReturnValue(true),
      findSources: vi.fn().mockResolvedValue([]),
      getSourceByUrl: vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('dQw4w9WgXcQ')) {
          return {
            video_id: 'dQw4w9WgXcQ',
            youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
            channel_title: 'RickAstleyVEVO',
          };
        }
        if (url.includes('vid22222222')) {
          return {
            video_id: 'vid22222222',
            youtube_url: 'https://www.youtube.com/watch?v=vid22222222',
            title: 'Pink Floyd - Time (Alternative Live)',
            channel_title: 'Pink Floyd',
          };
        }
        return {
          video_id: 'unknown1111',
          youtube_url: url,
          title: 'Unknown Artist - Unknown Song',
          channel_title: 'Unknown',
        };
      }),
    };

    mockSearchService = {
      search: vi.fn().mockResolvedValue([
        {
          artist: 'Pinguini Tattici Nucleari',
          title: 'Pastello Bianco',
          version_type: VersionType.STANDARD,
          youtube_url: 'https://www.youtube.com/watch?v=11111111111',
          video_id: '11111111111',
          score: 1.0,
        },
        {
          artist: 'Pinguini Tattici Nucleari',
          title: 'Pastello Bianco',
          version_type: VersionType.ACOUSTIC,
          youtube_url: 'https://www.youtube.com/watch?v=22222222222',
          video_id: '22222222222',
          score: 0.8,
        },
      ]),
    } as unknown as SearchService;

    authorizer = new TelegramAuthorizer(String(AUTHORIZED_USER_ID));

    handler = new TelegramBotHandler(
      mockTelegramClient,
      authorizer,
      mockSearchService,
      mockSourceProvider,
      libraryService
    );
  });

  it('silently ignores requests from unauthorized users (no messages sent)', async () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1000,
        chat: { id: UNAUTHORIZED_USER_ID, type: 'private' },
        from: { id: UNAUTHORIZED_USER_ID, is_bot: false, first_name: 'Attacker' },
        text: '/lista',
      },
    };

    await handler.handleUpdate(update);

    expect(mockTelegramClient.sendMessage).not.toHaveBeenCalled();
    expect(mockTelegramClient.editMessageText).not.toHaveBeenCalled();
  });

  it('responds to /start and /aiuto with Italian instructions', async () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 2,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/aiuto',
      },
    };

    await handler.handleUpdate(update);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Benvenuto in MusicSync'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('responds to /lista when library is empty and when populated', async () => {
    // 1. Empty library
    const updateEmpty: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 3,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/lista',
      },
    };

    await handler.handleUpdate(updateEmpty);
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('vuota'),
      expect.any(Object)
    );

    // 2. Add a song and list again
    await libraryService.addSong({
      artist: 'Pink Floyd',
      title: 'Comfortably Numb',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=33333333333',
    });

    await handler.handleUpdate(updateEmpty);
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Comfortably Numb'),
      expect.any(Object)
    );
  });

  it('searches for songs and presents top candidate with inline buttons', async () => {
    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 4,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/aggiungi Pastello Bianco',
      },
    };

    await handler.handleUpdate(update);

    expect(mockSearchService.search).toHaveBeenCalledWith('Pastello Bianco', { maxCandidates: 3 });
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Pastello Bianco'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ text: '✅ È questa', callback_data: 'add:ok' }),
              expect.objectContaining({ text: '❌ No', callback_data: 'next:22222222222' }),
            ],
          ],
        }),
      })
    );
  });

  it('confirms candidate addition on add:ok callback and advances sync_version', async () => {
    const candidateMessageText =
      `🎵 *Risultato trovato (1 di 2)*:\n\n` +
      `👤 *Artista*: Pinguini Tattici Nucleari\n` +
      `🎶 *Titolo*: Pastello Bianco\n` +
      `💿 *Versione*: standard\n` +
      `🔗 https://www.youtube.com/watch?v=11111111111\n\n` +
      `È questa la canzone che desideri aggiungere?`;

    const update: TelegramUpdate = {
      update_id: 5,
      callback_query: {
        id: 'cb_123',
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        data: 'add:ok',
        message: {
          message_id: 101,
          chat: { id: AUTHORIZED_USER_ID, type: 'private' },
          date: 1000,
          text: candidateMessageText,
        },
      },
    };

    await handler.handleUpdate(update);

    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb_123', 'Operazione completata!');
    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      101,
      expect.stringContaining('Aggiunto alla libreria'),
      expect.any(Object)
    );

    const active = await libraryService.listActiveSongs();
    expect(active.length).toBe(1);
    expect(active[0].title).toBe('Pastello Bianco');

    const syncState = await syncRepo.get();
    expect(syncState.sync_version).toBe(1);
  });

  it('handles candidate rejection and shows next candidate or terminal message', async () => {
    const updateNext: TelegramUpdate = {
      update_id: 6,
      callback_query: {
        id: 'cb_next',
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        data: 'next:vid22222222',
        message: {
          message_id: 101,
          chat: { id: AUTHORIZED_USER_ID, type: 'private' },
          date: 1000,
          text: 'Previous candidate',
        },
      },
    };

    await handler.handleUpdate(updateNext);

    expect(mockSourceProvider.getSourceByUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=vid22222222');
    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      101,
      expect.stringContaining('Pink Floyd'),
      expect.any(Object)
    );

    // Terminal rejection
    const updateTerminal: TelegramUpdate = {
      update_id: 7,
      callback_query: {
        id: 'cb_none',
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        data: 'next:none',
        message: {
          message_id: 101,
          chat: { id: AUTHORIZED_USER_ID, type: 'private' },
          date: 1000,
          text: 'Previous candidate',
        },
      },
    };

    await handler.handleUpdate(updateTerminal);
    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      101,
      expect.stringContaining('Nessun altro candidato'),
      expect.any(Object)
    );
  });

  it('handles direct YouTube links with confirmation prompt', async () => {
    const update: TelegramUpdate = {
      update_id: 8,
      message: {
        message_id: 8,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    };

    await handler.handleUpdate(update);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Never Gonna Give You Up'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ text: '✅ Aggiungi alla libreria', callback_data: 'add:ok' }),
              expect.objectContaining({ text: '❌ Annulla', callback_data: 'add:cancel' }),
            ],
          ],
        }),
      })
    );
  });

  it('handles /force <youtube_url> to force-add or update song', async () => {
    const update: TelegramUpdate = {
      update_id: 9,
      message: {
        message_id: 9,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/force https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    };

    await handler.handleUpdate(update);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Brano forzato/aggiornato con successo'),
      expect.any(Object)
    );

    const active = await libraryService.listActiveSongs();
    expect(active.length).toBe(1);
    expect(active[0].title).toContain('Never Gonna Give You Up');
  });

  it('handles /rimuovi <query> and removes song upon confirmation callback', async () => {
    // 1. Add a song first
    const added = await libraryService.addSong({
      artist: 'Coldplay',
      title: 'The Scientist',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=coldplay123',
    });

    // 2. Send /rimuovi command
    const updateRemove: TelegramUpdate = {
      update_id: 10,
      message: {
        message_id: 10,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/rimuovi scientist',
      },
    };

    await handler.handleUpdate(updateRemove);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Conferma rimozione'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ callback_data: `rem:ok:${added.song.id}` }),
              expect.objectContaining({ callback_data: 'rem:cancel' }),
            ],
          ],
        }),
      })
    );

    // 3. Confirm removal callback
    const updateConfirmRemove: TelegramUpdate = {
      update_id: 11,
      callback_query: {
        id: 'cb_rem',
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        data: `rem:ok:${added.song.id}`,
        message: {
          message_id: 102,
          chat: { id: AUTHORIZED_USER_ID, type: 'private' },
          date: 1000,
        },
      },
    };

    await handler.handleUpdate(updateConfirmRemove);

    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      102,
      expect.stringContaining('rimosso con successo'),
      expect.any(Object)
    );

    const activeAfter = await libraryService.listActiveSongs();
    expect(activeAfter.length).toBe(0);
  });

  it('handles /rimuovi <index> using list numbering (e.g. /rimuovi 1)', async () => {
    // 1. Add two songs
    const song1 = await libraryService.addSong({
      artist: 'Sereb Brancale',
      title: 'Al mio paese',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=sereb123',
    });
    const song2 = await libraryService.addSong({
      artist: 'Coldplay',
      title: 'Yellow',
      version_type: VersionType.STANDARD,
      youtube_url: 'https://www.youtube.com/watch?v=yellow123',
    });

    // In /list, songs are ordered alphabetically: 1 is Coldplay, 2 is Sereb Brancale
    // 2. Request removal by index '1' (Coldplay)
    const updateRemove: TelegramUpdate = {
      update_id: 12,
      message: {
        message_id: 12,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/rimuovi 1',
      },
    };

    await handler.handleUpdate(updateRemove);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Yellow'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ callback_data: `rem:ok:${song2.song.id}` }),
              expect.objectContaining({ callback_data: 'rem:cancel' }),
            ],
          ],
        }),
      })
    );

    // 3. Request removal by index '2' (Sereb Brancale)
    const updateRemove2: TelegramUpdate = {
      update_id: 13,
      message: {
        message_id: 13,
        date: 1000,
        chat: { id: AUTHORIZED_USER_ID, type: 'private' },
        from: { id: AUTHORIZED_USER_ID, is_bot: false, first_name: 'Owner' },
        text: '/rimuovi 2',
      },
    };

    await handler.handleUpdate(updateRemove2);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      AUTHORIZED_USER_ID,
      expect.stringContaining('Al mio paese'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ callback_data: `rem:ok:${song1.song.id}` }),
              expect.objectContaining({ callback_data: 'rem:cancel' }),
            ],
          ],
        }),
      })
    );
  });
});


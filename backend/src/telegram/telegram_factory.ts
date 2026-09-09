import { Env } from '../types.js';
import { HttpTelegramClient } from './telegram_client.js';
import { TelegramAuthorizer } from './telegram_authorizer.js';
import { TelegramBotHandler } from './telegram_handler.js';
import { SpotifyMetadataProvider } from '../search/spotify_provider.js';
import { YouTubeSearchMetadataProvider } from '../search/youtube_search_provider.js';
import { YouTubeSourceProvider } from '../search/youtube_source_provider.js';
import { CandidateRanker } from '../search/candidate_ranker.js';
import { SearchService } from '../search/search_service.js';
import { D1SongRepository } from '../persistence/song_repository.js';
import { D1SyncStateRepository } from '../persistence/sync_state_repository.js';
import { LibraryService } from '../library/library_service.js';

export function createTelegramBotHandler(env: Env): TelegramBotHandler {
  if (!env.DB) {
    throw new Error('Database binding (env.DB) is required to initialize Telegram bot handler');
  }

  const telegramClient = new HttpTelegramClient(env.TELEGRAM_BOT_TOKEN || '');
  const authorizer = new TelegramAuthorizer(env.AUTHORIZED_TELEGRAM_IDS);

  const metadataProviders = [
    new SpotifyMetadataProvider(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET),
    new YouTubeSearchMetadataProvider(env.YOUTUBE_API_KEY),
  ];

  const sourceProvider = new YouTubeSourceProvider(env.YOUTUBE_API_KEY);
  const searchService = new SearchService(metadataProviders, sourceProvider);

  const songRepo = new D1SongRepository(env.DB);
  const syncRepo = new D1SyncStateRepository(env.DB);
  const libraryService = new LibraryService(env.DB, songRepo, syncRepo);

  return new TelegramBotHandler(
    telegramClient,
    authorizer,
    searchService,
    sourceProvider,
    libraryService
  );
}

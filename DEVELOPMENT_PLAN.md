# MusicSync — Operational Development Plan

## 1. Overview & Project Goals

**MusicSync** is a lightweight, open-source music library synchronizer controlled remotely through Telegram and synchronized with a physical USB drive.

The system is composed of two independent applications:
1. **Online Backend**: Cloudflare Worker (TypeScript) + Cloudflare D1 (SQLite-compatible) managing the desired library, Telegram bot webhook, search resolution, and sync API.
2. **Local Client**: Python console application running on Windows (portable to Linux), executed manually to scan the USB drive, catalog pre-existing tracks, and reconcile the physical filesystem with the online desired library.

### Development Priorities
1. **Immediate Priority**: Activate the Telegram Bot, Backend, and Cloudflare D1 database to start collecting, searching, and organizing new music from mobile devices immediately.
2. **Secondary Priority**: Implement the Python client's USB scanner and cataloging tool (via a dedicated CLI argument) to import existing tracks into D1 without audio downloads, allowing the user to review, curate, and clean up the library over time.
3. **Execution Priority**: Complete the full synchronization planner and download executor (`yt-dlp` + `FFmpeg`) to download missing audio files and reconcile physical files on the USB drive.

---

## 2. Architecture & Design Invariants

- **Separation of Concerns**:
  - The online backend never touches the USB filesystem or downloads audio.
  - The local client never downloads arbitrary URLs—only validated URLs approved in the backend database.
- **Search Architecture**:
  - **Spotify Web API** serves as the primary `MetadataProvider` to resolve colloquial, fuzzy, or imperfect user queries into canonical metadata (Artist, Title, Version).
  - **YouTube Data API v3** serves as the `SourceProvider` to locate the exact audio stream URL, and as a fallback `MetadataProvider` if Spotify credentials are not provided.
  - All providers implement clean, modular interfaces so that changing or adding a provider requires implementing a single class without touching domain logic.
- **Security & Authorization**:
  - Telegram bot authorization is strictly restricted by numerical user ID (`AUTHORIZED_TELEGRAM_IDS`). Unauthorized updates are silently dropped without leaking information.
  - Sync API endpoints are protected with a pre-shared key (`SYNC_TOKEN`) validated via constant-time comparison (`crypto.subtle.timingSafeEqual`).
- **Data Integrity & Versioning**:
  - The desired library uses a monotonic `sync_version`. Every addition, soft deletion, or import atomically advances the version.
  - Logical identity is defined by `normalized_artist + normalized_title + version_type`.
  - Re-adding a previously removed song triggers a logical reactivation (UPSERT) rather than creating a duplicate record.
- **Filesystem Safety**:
  - Operations are strictly restricted to the configured `MANAGED_FOLDER` (e.g. `Music/`).
  - Path traversal is prevented; filenames are sanitized; destructive deletions only affect managed tracks marked as obsolete.

---

## 3. Phased Implementation Roadmap

```
[Phase 1] Repository Structure, Document Reorganization & .gitignore [COMPLETATA]
    │
[Phase 2] Backend Core & Tooling (TypeScript, Wrangler, Vitest) [COMPLETATA]
    │
[Phase 3] Database D1 (Schema, Migrations, Repositories, Batch Transactions) [COMPLETATA]
    │
[Phase 4] Domain Logic & Search Architecture (Spotify Primary, YouTube Source) [COMPLETATA]
    │
[Phase 5] Telegram Bot Interface (Webhook, Authorization, Italian Commands)
    │
[Phase 6] Sync API Endpoints (/api/v1/sync/state, /api/v1/sync/report)
    │
[User Checkpoint] External Credentials Setup (Telegram, Cloudflare, Spotify, YouTube)
    │
[Phase 7] Cloudflare Deployment & Live Telegram Music Collection
    │
[Phase 8] Python Client — USB Scanner & Existing Library Cataloging (--import-usb)
    │
[Phase 9] Python Client — Full Sync Planner & Executor (yt-dlp, FFmpeg, ID3v2.3)
```

---

### Phase 1: Repository Structure, Document Reorganization & Tooling Setup [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Align the repository with `PROJECT_STRUCTURE.md`, organize design documentation, configure `.gitignore`, and ensure Google AI Studio can run tests cleanly without committing preview artifacts.
- **Components & Actions**:
  - [x] Move design documents (`REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`) into `docs/design/`.
  - [x] Move `PROJECT_STRUCTURE.md` into `docs/`.
  - [x] Update `.gitignore` to ignore:
    - Node & Python build artifacts: `node_modules/`, `.venv/`, `__pycache__/`, `*.pyc`.
    - Local Cloudflare D1 data: `.wrangler/`, `d1.json`, `data/`, `.migrations/`.
    - Environment secrets: `.env`, `.env.local`, `secrets.json`, `config.local.toml`.
    - Google AI Studio preview dummy files or dev-server files.
  - [x] Create directory skeletons for `backend/` and `client/`.
- **Verification Criteria**:
  - `git status` reflects clean layout with ignored artifacts.
  - AI Studio preview container operates without workspace errors.

---

### Phase 2: Backend Core & Tooling (Cloudflare Worker + TypeScript) [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Establish the Cloudflare Worker application skeleton with strict TypeScript configuration, automated testing via Vitest, and an HTTP router.
- **Components & Actions**:
  - [x] Create `backend/package.json`, `backend/tsconfig.json`, `backend/wrangler.toml`.
  - [x] Create `backend/src/index.ts` with standard `fetch(request, env, ctx)` handler:
    - [x] Route `/api/v1/health` for diagnostics.
    - [x] Router dispatching `/telegram/webhook` and `/api/v1/sync/*`.
    - [x] Constant-time `Authorization: Bearer <SYNC_TOKEN>` verification middleware.
    - [x] Telegram webhook secret token validation.
  - [x] Configure Vitest for fast, offline unit testing.
- **Verification Criteria**:
  - [x] `npx tsc --noEmit` compiles without errors.
  - [x] `npm test` runs Vitest and passes all basic routing and security header tests (20/20 tests passed).

---

### Phase 3: Database D1 (Schema, Migrations, Repositories & Atomicity) [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Define the SQLite-compatible D1 schema according to `DATABASE.md` and implement repository abstractions to isolate persistence from application logic.
- **Components & Actions**:
  - [x] Create `backend/migrations/0001_initial.sql`:
    - [x] `songs` table with unique constraint on `(normalized_artist, normalized_title, version_type)` and partial unique index on non-null `youtube_url`.
    - [x] `tracks` table with foreign key to `songs(id)` (ON DELETE RESTRICT) and unique constraint on `relative_path` and `song_id`.
    - [x] `sync_state` singleton table (`id = 1`, `sync_version >= 0`).
  - [x] Implement domain models in `backend/src/domain/`:
    - [x] `version_type.ts`: `VersionType` enum and validation.
    - [x] `song.ts`: `Song` entity, `SongStatus`, `SongIdentity`.
    - [x] `track.ts`: `Track` entity.
    - [x] `sync_state.ts`: `SyncState` entity.
  - [x] Implement repositories in `backend/src/persistence/`:
    - [x] `D1SongRepository`: findById, findByIdentity, findByYouTubeUrl, listActive, listAll, insert, logical UPSERT / reactivation, softDelete, prepared statements.
    - [x] `D1TrackRepository`: track creation, association lookup, deletion by id / songId / relativePath.
    - [x] `D1SyncStateRepository`: singleton fetch, atomic increment, sync completion metadata.
  - [x] Ensure all database queries use strictly parameterized statements (`db.prepare(...).bind(...)`).
- **Verification Criteria**:
  - [x] Migration applies cleanly to local D1 instance (`wrangler d1 migrations apply DB --local`).
  - [x] Vitest integration tests verify unique constraints, version monotonicity, atomicity rollback with `db.batch()`, and reactivation of soft-deleted songs (40/40 tests passed).
  - [x] `npx tsc --noEmit` compiles without errors.

---

### Phase 4: Domain Logic & Search Architecture (Spotify Primary, YouTube Source) [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Implement the domain rules, normalization, YouTube URL validation, and a decoupled search engine featuring Spotify for canonical metadata and YouTube for audio source resolution.
- **Components & Actions**:
  - [x] Domain normalization in `backend/src/domain/normalization.ts`:
    - [x] `normalizeString`: lowercase conversion, accent stripping (NFD), punctuation normalization, whitespace collapsing.
    - [x] `stripVideoClutter`: removal of video tags (`Official Video`, `Lyrics`, `Visualizer`, etc.).
    - [x] `detectVersionType`: version detection (`standard`, `cover`, `remix`, `acoustic`, `live`).
    - [x] `parseArtistAndTitle`: hyphen/dash extraction of artist and title.
    - [x] `calculateTokenOverlap`: Jaccard token overlap for search ranking.
  - [x] Strict YouTube URL validation in `backend/src/validation/youtube_url.ts`:
    - [x] Strict hostname verification (`youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`).
    - [x] Strict rejection of lookalike domain attacks (`evil.example/youtube.com`, `youtube.com.evil.example`).
    - [x] Rejection of non-HTTP protocols and embedded credentials.
    - [x] Canonicalization to standard 11-char video ID format (`https://www.youtube.com/watch?v=...`).
  - [x] Provider interfaces in `backend/src/search/`:
    - [x] `MetadataProvider` interface (`metadata_provider.ts`).
    - [x] `SpotifyMetadataProvider`: primary metadata provider using Spotify Web API (`spotify_provider.ts`).
    - [x] `YouTubeSearchMetadataProvider`: fallback metadata provider (`youtube_search_provider.ts`).
    - [x] `SourceProvider` interface (`source_provider.ts`).
    - [x] `YouTubeSourceProvider`: audio source provider with offline fallback (`youtube_source_provider.ts`).
    - [x] `CandidateRanker`: deterministic scoring based on exact match, token overlap, and unrequested live version penalty (`candidate_ranker.ts`).
    - [x] `SearchService`: coordination of metadata and source providers, direct YouTube URL handling (`search_service.ts`).
  - [x] Application library service in `backend/src/library/`:
    - [x] `DuplicateChecker`: duplicate detection by identity and YouTube URL (`duplicate_checker.ts`).
    - [x] `LibraryService`: addition, logical reactivation / UPSERT, `/force` addition, soft removal, atomic `db.batch()` with `sync_version` increment (`library_service.ts`).
- **Verification Criteria**:
  - [x] Vitest unit tests covering normalization edge cases, lookalike URL rejection, and duplicate detection.
  - [x] Test suites using mock providers verifying ranking accuracy and graceful fallback to YouTube if Spotify is unconfigured.
  - [x] Integration tests for LibraryService verifying atomic version monotonicity and reactivation.
  - [x] All 74 tests passing cleanly (`74 passed (74)`).
  - [x] `npx tsc --noEmit` compiles without errors.

---

### Phase 5: Telegram Bot Interface (Webhook, Authorization, Italian Commands) [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Implement the Telegram bot interaction layer in Italian, strictly enforcing the user allowlist and delivering an intuitive music search and library management experience.
- **Components & Actions**:
  - [x] Strict authorization filter in `backend/src/telegram/telegram_authorizer.ts`:
    - [x] Verifies sender ID against comma-separated `AUTHORIZED_TELEGRAM_IDS`.
    - [x] Unauthorized senders are silently ignored (no responses, zero information leakage) with structured console warning logs.
  - [x] Telegram API client in `backend/src/telegram/telegram_client.ts`:
    - [x] Implements `sendMessage`, `editMessageText`, and `answerCallbackQuery` against Telegram Bot API.
  - [x] Italian UX formatter in `backend/src/telegram/telegram_formatter.ts`:
    - [x] Markdown formatting for candidates, help guides, remove prompts, and library list with 4000-char message chunking.
    - [x] Inline keyboards for candidate verification (`[✅ È questa]`, `[❌ No]`), direct link additions, and song removals (`rem:ok:<id>`, `rem:cancel`).
    - [x] Robust parsing helper `parseCandidateFromMessage`.
  - [x] Telegram Update Handler in `backend/src/telegram/telegram_handler.ts`:
    - [x] `/add` / `/aggiungi <query>` or free text: searches providers and displays candidates sequentially with inline buttons.
    - [x] Direct YouTube links: validates canonical URL, extracts metadata, and presents addition confirmation keyboard.
    - [x] `/force <youtube-link>`: forces song addition or updates the audio source URL.
    - [x] `/remove` / `/rimuovi <query>`: token-overlap search among active songs and requests confirmation before soft-deleting.
    - [x] `/list` / `/lista`: displays the active desired music library with clean track count.
    - [x] `/help` / `/aiuto` / `/start`: displays concise command instructions in Italian.
    - [x] Callback queries: handles `add:ok`, `add:cancel`, `next:<vid>`, `rem:ok:<id>`, `rem:cancel`.
  - [x] Dependency injection and routing integration:
    - [x] `createTelegramBotHandler(env)` factory in `backend/src/telegram/telegram_factory.ts`.
    - [x] Webhook route dispatch in `backend/src/index.ts` behind `X-Telegram-Bot-Api-Secret-Token` check.
- **Verification Criteria**:
  - [x] Automated Vitest unit and integration test suite in `backend/tests/telegram/`:
    - [x] `telegram_authorizer.test.ts`: allows authorized users, silently rejects unauthorized users with log, handles edge cases.
    - [x] `telegram_formatter.test.ts`: Italian commands, candidate formatting, chunked lists, candidate parsing.
    - [x] `telegram_handler.test.ts`: simulates webhook updates for all commands, candidate acceptance/rejection flows, `/force`, and removal flows.
  - [x] Unauthorized Telegram IDs receive zero responses and leak no information.
  - [x] Successful candidate confirmations properly advance `sync_version` in the database.
  - [x] All 95 tests passing cleanly (`95 passed (95)`).
  - [x] `npx tsc --noEmit` compiles without errors.

---

### Phase 6: Sync API Endpoints (/api/v1/sync/state, /api/v1/sync/report) [COMPLETATA]
- **Stato**: ✅ COMPLETATA
- **Objective**: Expose the minimal REST API required by the synchronization client, authenticated with `SYNC_TOKEN`.
- **Components & Actions**:
  - In `backend/src/interfaces/api/`:
    - `GET /api/v1/sync/state`: returns consistent snapshot with `sync_version`, `desired_tracks` (with relative paths to `MANAGED_FOLDER`), and `obsolete_tracks`.
    - `POST /api/v1/sync/report`: accepts client execution report (`download`, `delete`, `import`).
    - Transactional handling of `import` operations: creates song records (`youtube_url = NULL`) and associated tracks, advancing `sync_version`.
    - Safe deletion of obsolete `tracks` records after client confirmation, leaving `songs` soft-deleted.
    - Uniform JSON error payloads with standard HTTP codes (200, 400, 401, 409).
- **Verification Criteria**:
  - API unit/integration tests for authentication (valid token vs 401 Unauthorized via `timingSafeEqual`).
  - Verification that report processing is idempotent and properly handles version conflicts (HTTP 409).

---

### USER CHECKPOINT: External Services & Credentials Setup
- **Objective**: Guide the user step-by-step through configuring external services before deploying to production.
- **Guided Tasks**:
  1. **Telegram Bot**:
     - Talk to `@BotFather`, run `/newbot`, choose name and username.
     - Copy `TELEGRAM_BOT_TOKEN`.
     - Obtain numeric Telegram User ID (e.g. via `@userinfobot`) for `AUTHORIZED_TELEGRAM_IDS`.
  2. **Spotify Developer Portal**:
     - Create an app at `developer.spotify.com/dashboard`.
     - Obtain `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
  3. **Google Cloud Console**:
     - Create a project and enable YouTube Data API v3.
     - Generate a restricted API key for `YOUTUBE_API_KEY`.
  4. **Cloudflare & Worker Secrets**:
     - Login via `wrangler login`.
     - Create remote D1 database: `wrangler d1 create musicsync-db`.
     - Generate random `SYNC_TOKEN` and webhook secret.

---

### Phase 7: Cloudflare Deployment & Live Telegram Music Collection
- **Objective**: Deploy the backend to Cloudflare Workers and D1, activate the Telegram webhook, and verify real-time song collection from the user's mobile device.
- **Components & Actions**:
  - Apply database migrations to remote D1: `wrangler d1 migrations apply musicsync-db --remote`.
  - Set production secrets on Cloudflare:
    - `TELEGRAM_BOT_TOKEN`
    - `AUTHORIZED_TELEGRAM_IDS`
    - `SPOTIFY_CLIENT_ID`
    - `SPOTIFY_CLIENT_SECRET`
    - `YOUTUBE_API_KEY`
    - `SYNC_TOKEN`
    - `TELEGRAM_WEBHOOK_SECRET`
  - Deploy worker: `wrangler deploy`.
  - Register webhook with Telegram API using the secret token.
- **Verification Criteria**:
  - Sending `/start`, `/add`, `/list`, and direct YouTube links from Telegram produces expected responses.
  - Adding songs updates remote D1 records and increments `sync_version`.
  - User can actively use the bot for daily music gathering.

---

### Phase 8: Python Client — USB Scanner & Existing Library Cataloging
- **Objective**: Build the Python client module to scan the physical USB drive, parse pre-existing MP3 filenames, and populate the online database with `youtube_url = NULL` so the user can curate existing music.
- **Components & Actions**:
  - Create `client/pyproject.toml` and CLI entrypoints in `client/src/music_sync/`:
    - `FileSystem`: scans `MANAGED_FOLDER` strictly, ignoring non-MP3 files and other USB directories.
    - `FilenameParser`: parses `Artist - Title.mp3`, strips unsafe characters, and identifies version tags.
    - `BackendClient`: HTTPS client authenticating with `Authorization: Bearer <SYNC_TOKEN>`.
  - Dedicated CLI command:
    - `python -m music_sync --import-usb --dry-run`: previews all detected MP3 files without altering the database.
    - `python -m music_sync --import-usb`: sends the `import` report to `POST /api/v1/sync/report`, adding records to `songs` and `tracks`.
- **Verification Criteria**:
  - Pytest tests validating filename parsing across various formats.
  - Successful import of real USB files into the remote D1 database.
  - Imported songs become immediately visible and manageable via Telegram `/list` and `/remove`.

---

### Phase 9: Python Client — Full Sync Planner & Executor (yt-dlp & USB Reconciliation)
- **Objective**: Complete the client-side synchronization engine to download missing desired songs, remove obsolete files, and maintain physical parity on the USB drive.
- **Components & Actions**:
  - In `client/src/music_sync/`:
    - `SyncPlanner`: compares `DesiredState` with `PhysicalState`, producing deterministic plans (`KEEP`, `DOWNLOAD`, `DELETE`, `WARN_MISSING_SOURCE`).
    - `YtDlpDownloader`: invokes `yt-dlp` and `FFmpeg` with `shell=False`, downloads sequentially, uses `.part` temporary files, and tags MP3s with car-stereo-compatible ID3v2.3 tags (artist, title, version).
    - `SyncExecutor`: executes downloads, securely removes confirmed obsolete tracks, and posts final status to `POST /api/v1/sync/report`.
    - CLI options: `python -m music_sync` (full sync) and `python -m music_sync --dry-run` (detailed preview table).
- **Verification Criteria**:
  - Pytest tests for planner decisions and recovery from interrupted `.part` downloads.
  - End-to-end execution: missing tracks are downloaded, tagged, placed into `MANAGED_FOLDER`, and reported to the backend.
  - USB drive plays correctly on destination media hardware.

---

## 4. Definition of Done for Milestones

| Milestone | Deliverable | Key Acceptance Criteria |
|---|---|---|
| **M1: Backend Core & DB** | Phases 1–3 | Schema migrated, repositories tested, atomicity guaranteed with `db.batch()`. |
| **M2: Search & Bot Logic** | Phases 4–6 | Spotify metadata + YouTube source, Telegram commands functioning in Vitest tests. |
| **M3: Live Music Collection** | Phase 7 | Worker deployed to Cloudflare, user can search and manage songs via Telegram. |
| **M4: USB Cataloging** | Phase 8 | Existing USB MP3s imported into D1 via `--import-usb`, visible in Telegram. |
| **M5: Physical Sync Engine** | Phase 9 | Full reconciliation working: downloads via `yt-dlp`, safe deletions, ID3v2.3 tags. |
# Test change

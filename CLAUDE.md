# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MusicSync** — A lightweight, open-source music library synchronizer controlled through Telegram.

- **Online Backend**: Cloudflare Worker (TypeScript) + Cloudflare D1 (SQLite) — handles Telegram bot, YouTube search, library management, sync API
- **Windows Sync Client**: Python — manually launched, uses yt-dlp + FFmpeg, syncs desired library with physical USB drive

> **Nota importante sul Frontend**: In questa versione del progetto **non è presente alcun frontend web o GUI**. L'interfaccia utente è esclusivamente il bot Telegram, e la sincronizzazione avviene tramite il client Python per Windows. Non bisogna assolutamente perdere tempo ad implementare interfacce grafiche, web UI o frontend non richiesti.

The backend is the source of truth for the **desired library**. The Windows client reconciles it with the **physical USB state**.

---

## Commands

### Backend (Cloudflare Worker)
```bash
# From backend/ directory
npm install              # Install dependencies
npm run dev              # Local development with wrangler
npm run deploy           # Deploy to Cloudflare
npm run db:local         # Apply migrations to local D1
npm run db:remote        # Apply migrations to remote D1
npm test                 # Run tests (Vitest)
```

### Windows Client (Python)
```bash
# From client/ directory
pip install -r requirements.txt
python -m pytest         # Run tests
python -m music_sync     # Run synchronization manually
```

### Common Development
```bash
# From project root
git status
git diff
```

---

## Architecture

### Two Independent Applications

```
Telegram ──► Backend (Cloudflare Worker) ──► Sync API ──► Windows Client ──► USB Drive
                 │                                          ▲
                 │ HTTPS                                    │
                 ▼                                          │
           Cloudflare D1                                    │
           (desired state)                                  │
```

### Key Boundaries

| Boundary | Purpose |
|----------|---------|
| **Telegram Interface** | Parses updates, authorizes users, handles commands, formats responses — no DB/sync logic |
| **YouTube Validation** | Validates URL format before metadata retrieval — rejects lookalike domains |
| **Search** | External YouTube provider → local normalization/ranking/filtering |
| **Persistence** | Repository pattern isolates D1 access — no raw SQL in application logic |
| **Filesystem** | Windows client only operates within configured `MANAGED_FOLDER` |
| **Download** | Isolated downloader (yt-dlp/FFmpeg) — doesn't decide what to download |
| **Sync Version** | Monotonic `sync_version` — client reports version it synced, backend keeps newer state |

### Data Model (DATABASE.md)

- **songs** — desired library entries (unique: normalized_artist + normalized_title + version_type)
- **tracks** — physical USB files (relative_path to MANAGED_FOLDER, FK to songs)
- **sync_state** — single row: `sync_version`, timestamps, status

**Song identity** = normalized artist + normalized title + version_type (standard/cover/remix/acoustic/live)

### API (API.md)

Only two endpoints for Windows client:
- `GET /api/v1/sync/state` — returns `sync_version` + active songs with YouTube URLs
- `POST /api/v1/sync/report` — client reports operations (download/delete/import) for a version

---

## Critical Rules

1. **Backend never accesses USB** — Windows client owns filesystem
2. **Client never downloads arbitrary URLs** — only validated URLs from backend database
3. **Telegram authorization** — numeric User IDs only, configured via `AUTHORIZED_TELEGRAM_IDS`
4. **Secrets out of source control** — use `.env.example` with placeholders
5. **Sync safety** — if backend/USB unavailable, leave data untouched and report failure
6. **No AI runtime** — deterministic search ranking, normalization, duplicate detection
7. **Italian UI** — all bot messages in Italian
8. **Auto-generated repository tree** — `docs/project_structure/repository_tree.md` is automatically regenerated on every commit via git pre-commit hook (`tools/project_tree/generate_tree.py`). NEVER modify it manually.

---

## Testing Strategy

- Normal tests **must not** depend on live Telegram/YouTube
- Use fakes: search provider, test repository, in-memory sync states, fake downloader, temp directories
- Required coverage: normalization, duplicate detection, Song identity, YouTube URL validation, search ranking, DB operations, Telegram auth, sync decisions, USB file discovery, filename parsing, state transitions, error handling

---

## Configuration

### Backend (Cloudflare Worker secrets)
```
TELEGRAM_BOT_TOKEN
AUTHORIZED_TELEGRAM_IDS  # comma-separated numeric IDs
YOUTUBE_API_KEY
```

### Windows Client (local config/env)
```
BACKEND_URL
USB_PATH  # e.g., D:\
MANAGED_FOLDER  # e.g., Music
```

---

## File Structure (to be defined in PROJECT_STRUCTURE.md)

```
backend/
  src/
    telegram/      # Telegram interface layer
    search/        # YouTube search + local ranking
    library/       # Song management, duplicate detection
    sync/          # Sync API endpoints
    persistence/   # D1 repositories
    validation/    # YouTube URL validation
    domain/        # Song, Track, normalization
  migrations/
  tests/

client/
  pyproject.toml
  src/
    music_sync/
      domain/        # PhysicalTrack, SyncPlan, SyncResult
      application/   # SyncService, SyncPlanner, SyncExecutor
      infrastructure/# FileSystem, YtDlpDownloader, BackendClient
      cli/           # CLI entry points and arguments
      config.py      # Local settings (USB_PATH, SYNC_TOKEN, etc.)
  tests/
```

---

## Non-Goals (First Version)

No GUI, web UI, mobile app, streaming, multiple USBs, playlists, AI, continuous polling, Windows service, background daemon, complex auth, microservices, Redis, WebSockets, event sourcing, CQRS.

---

*(Note: Temporary `.gitkeep` files are placed in empty directory skeletons. They must be removed as each folder gets populated with actual source files. Once all `.gitkeep` files are removed, this note must also be deleted from `CLAUDE.md`)*
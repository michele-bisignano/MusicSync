<p align="center">
  <img src="public/MusicSync_icon.png" width="80" height="80" alt="MusicSync Logo">
</p>

# <p align="center">MusicSync 🎵🚗</p>

**MusicSync** is a lightweight, automated system designed to manage your music library on the go via a **private Telegram Bot** and deterministically synchronize it to a **car stereo USB flash drive**, formatting downloaded audio files with `ID3v2.3` tags and standard `Title - Artist.mp3` naming.

---

## 🎯 Purpose

Discovering a great track while on the move and wanting it instantly on your car USB shouldn't be tedious. Manually searching, downloading, renaming, and copying files is friction.

**MusicSync automates the entire workflow:**
1. **On the Move**: Search or send YouTube/Spotify links to your **private Telegram Bot**. The bot retrieves precise metadata and registers the song in your cloud database (Cloudflare D1).
2. **At Home**: Plug your USB flash drive into your computer and run the client (or standalone `.exe`).
3. **Synchronization**: The client downloads missing songs in high-quality MP3, applies stereo car-compatible `ID3v2.3` tags, cleans up removed tracks, and reports back to the cloud.

---

## 🚀 How to Use

### 1. Telegram Bot (Daily Management)

Interact with your private bot using simple commands:

| Action | Command / Usage |
|---|---|
| **Search a track** | Send any query (e.g., `Shape of You Ed Sheeran`). The bot returns candidate versions with inline buttons to confirm (Original, Remix, Live, Cover, Acoustic). |
| **Add from link** | Send a YouTube or Spotify link directly (`https://youtu.be/...`). |
| **Force / Update URL** | `/force <youtube_url>` to force-add or update a specific video for a song. |
| **View Library** | `/lista` displays a numbered list of all active songs in your collection. |
| **Remove a track** | `/rimuovi <number>` (e.g., `/rimuovi 3`) or `/rimuovi <query>`. |
| **Quick Help** | `/start` or `/help`. |

---

### 2. USB Client / CLI (`musicsync.exe`)

Insert your USB drive and run the synchronization tool:

```bash
# Standard run (downloads missing tracks, removes obsolete files)
musicsync.exe
# Or via Python:
python -m music_sync
```

#### Useful Flags & Options:
- **Dry Run Simulation (`--dry-run`)**:
  ```bash
  musicsync.exe --dry-run
  ```
  Previews the action table (DOWNLOAD, DELETE, KEEP) without modifying any files.
- **Import Existing USB Library (`--import-usb`)**:
  ```bash
  musicsync.exe --import-usb
  ```
  Scans pre-existing MP3 files on your USB drive, parses their metadata, and registers them into the remote database.

---

## 🛠️ Setup & Architecture Guide

Follow these steps in order to set up your MusicSync system.

---

### Step 1: Create Your Telegram Bot & Get Your ID

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose a name and username for your bot.
3. Copy the **HTTP API Token** (this is your `TELEGRAM_BOT_TOKEN`).
4. Retrieve your numeric **Telegram User ID** via [@userinfobot](https://t.me/userinfobot) (this is your `AUTHORIZED_TELEGRAM_IDS`). *Only specified IDs can access the bot.*

---

### Step 2: Deploy Backend to Cloudflare (Worker + D1)

The backend runs on Cloudflare Workers backed by a D1 SQLite database.

#### 1. Install backend dependencies
```bash
cd backend
npm install
```

#### 2. Authenticate with Cloudflare
```bash
npx wrangler login
```

#### 3. Create the D1 Database and Apply Migrations
```bash
# Create database
npx wrangler d1 create musicsync-db

# Copy the generated 'database_id' into backend/wrangler.toml under [[d1_databases]]

# Apply SQL schema migrations
npx wrangler d1 migrations apply musicsync-db --remote
```

#### 4. Configure Cloudflare Secrets
Securely store your production secrets in the Worker:
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET    # A random secret string (e.g. 32 chars)
npx wrangler secret put AUTHORIZED_TELEGRAM_IDS    # Your numeric ID (e.g. 12345678)
npx wrangler secret put SYNC_TOKEN                 # A shared secret key for client synchronization
npx wrangler secret put YOUTUBE_API_KEY            # YouTube Data API v3 key (from Google Cloud Console)
npx wrangler secret put SPOTIFY_CLIENT_ID          # (Optional) Spotify Developer credentials
npx wrangler secret put SPOTIFY_CLIENT_SECRET      # (Optional) Spotify Developer credentials
```

*(For local testing, you can copy `backend/.dev.vars.example` to `backend/.dev.vars`).*

#### 5. Deploy the Worker
```bash
npx wrangler deploy
```
Note the deployed Worker URL (e.g., `https://musicsync-backend.<your-subdomain>.workers.dev`).

#### 6. Register Telegram Webhook
Run this request in your browser or terminal to link Telegram to your Worker:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://musicsync-backend.<your-subdomain>.workers.dev/api/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

---

### Step 3: Configure the Local Client (`config.toml`)

In your local machine, navigate to the `client/` folder and create `config.toml` (copying from `config.example.toml`):

```toml
# config.toml
backend_url = "https://musicsync-backend.<your-subdomain>.workers.dev"
sync_token = "your_shared_sync_token_from_step_2"
usb_path = "E:\\"               # Windows drive letter (or /Volumes/USB on macOS, /media/usb on Linux)
managed_folder = "Music"        # Subfolder on the USB drive where tracks are stored
timeout = 30
```

---

### Step 4: Build & Run the Standalone Executable (`.exe`)

#### Prerequisites:
1. **Python 3.11+** installed.
2. **FFmpeg** installed and added to system `PATH` (required by `yt-dlp` for audio conversion).

#### Build with PyInstaller:
```bash
cd client
pip install -r requirements.txt
pip install pyinstaller

# Build single executable file:
pyinstaller --onefile --name musicsync src/music_sync/__main__.py
```

The resulting executable will be generated at `client/dist/musicsync.exe`.

#### How to use it:
1. Place `musicsync.exe` and your `config.toml` in the same directory (e.g. on your Desktop or a dedicated folder `C:\MusicSync\`).
2. Plug in your car USB drive.
3. Double-click `musicsync.exe` (or run it via CLI): your music library syncs in seconds.

---

## 📂 Repository Structure

Below is a high-level preview of the repository structure. For the complete file-by-file inventory, check out the [Full Repository Tree Documentation](docs/project_structure/repository_tree.md).

```text
MusicSync/
├── backend/                  # Cloudflare Worker (TypeScript / D1)
│   ├── src/                  # Domain, Persistence, Telegram Bot, Search, Sync API
│   ├── migrations/           # SQL schema migrations
│   └── tests/                # Vitest test suite (118 tests)
├── client/                   # Local Sync Client (Python)
│   ├── src/music_sync/       # Domain, Downloader (yt-dlp + ID3v2.3), Planner, CLI
│   ├── config.example.toml   # Client configuration template
│   └── tests/                # Pytest test suite (51 tests)
├── docs/design/              # System architecture, API, database & requirements specs
└── README.md                 # Project README
```

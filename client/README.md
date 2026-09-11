# MusicSync Client

Lightweight Python client that reconciles a physical USB flash drive with the remote MusicSync library on Cloudflare D1.

## Prerequisites

- **Python 3.11+**
- **FFmpeg** installed and accessible in the system `PATH` (used by `yt-dlp` for audio extraction and MP3 encoding).

## Installation

```bash
pip install -r requirements.txt
# or install in editable mode:
pip install -e .
```

## Configuration

Copy `config.example.toml` to `config.toml` (or `config.local.toml` for local overrides):

```toml
backend_url = "https://musicsync-backend.your-worker.workers.dev"
sync_token = "your-pre-shared-sync-token"
usb_path = "E:\\"               # Windows: 'E:\\', macOS: '/Volumes/USB', Linux: '/media/usb'
managed_folder = "Music"        # Subfolder on USB where music is managed
timeout = 30
```

Configuration can also be passed via environment variables (`MUSICSYNC_BACKEND_URL`, `MUSICSYNC_SYNC_TOKEN`, `MUSICSYNC_USB_PATH`, `MUSICSYNC_MANAGED_FOLDER`) or CLI arguments.

## Usage

### 1. Full Synchronization (Default)

Compares the remote desired state against the physical files on the USB drive, downloads missing songs sequentially via `yt-dlp`, tags MP3s with ID3v2.3 tags, removes obsolete tracks, imports manual additions, and reports the results back to the backend.

```bash
# Preview operations in a table without modifying files:
python -m music_sync --dry-run

# Run live synchronization:
python -m music_sync

# Override options:
python -m music_sync --usb-path /media/usb --managed-folder Canzoni
```

### 2. Cataloging Existing USB Drive

If you have a USB drive with pre-existing MP3 files, scan and import them into the remote database so they can be managed via Telegram:

```bash
# Preview tracks to be imported:
python -m music_sync --import-usb --dry-run

# Execute import:
python -m music_sync --import-usb
```

## File Structure

- `src/music_sync/domain/`: Song models, normalization, and filename parser.
- `src/music_sync/infrastructure/`: FileSystem, Downloader (`yt-dlp` + Mutagen ID3v2.3), BackendClient.
- `src/music_sync/application/`: SyncPlanner, SyncExecutor, UsbImporter, SyncService.
- `src/music_sync/cli/`: Argparse CLI interface and table formatter.
- `tests/`: Full pytest test suite.

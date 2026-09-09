# MusicSync --- Architecture Specification

## 1. Overview

MusicSync consists of two logically independent applications:

1.  **Online Backend**
    -   receives Telegram updates;
    -   identifies and authorizes Telegram users;
    -   manages the desired music library;
    -   performs search/identification;
    -   stores persistent metadata;
    -   exposes the synchronization API;
    -   does not access the USB filesystem.
2.  **Sync Client**
    -   currently implemented for Windows;
    -   manually launched;
    -   accesses the physical USB;
    -   scans the managed folder;
    -   compares desired and physical state;
    -   downloads missing tracks;
    -   imports USB-only tracks;
    -   removes obsolete managed tracks;
    -   reports synchronization results.

The desired library lives online.

The physical library lives on the USB.

The sync client reconciles them.

### Deployment note

The first deployment is online, with Cloudflare Workers + D1 as the
current implementation choice.

This is not an architectural requirement. The backend could later be
moved to a local Linux server or another deployment model without
changing the domain/application responsibilities.

------------------------------------------------------------------------

## 2. Technology Choices

### 2.1 Backend

Current implementation:

``` text
Cloudflare Workers
TypeScript
```

Cloudflare is chosen because it provides a small HTTPS endpoint, webhook
support and a convenient free-tier deployment for the current project.

The code should avoid coupling domain/application logic directly to
Cloudflare APIs.

### 2.2 Database

Current implementation:

``` text
Cloudflare D1
```

D1 is SQLite-compatible and stores metadata only.

Audio files are never stored in the database.

The persistence layer must remain isolated enough that another database
implementation can be introduced later.

### 2.3 Telegram

``` text
Telegram Bot API
Webhook
```

Telegram sends updates to the backend through an HTTPS webhook.

There is no polling process.

Telegram provides the sender identity through its numeric User ID.

MusicSync uses that ID to decide whether the sender is authorized.

### 2.4 YouTube

Current search/source provider:

``` text
YouTube Data API
```

The API key is stored as a backend secret.

The Windows client does not receive the API key.

YouTube is also the initial source used for downloading through yt-dlp.

### 2.5 Optional Spotify integration

The search architecture should permit an optional Spotify
search/metadata provider.

The intended use is identification and metadata enrichment, for example:

``` text
confused user description
        ↓
Spotify / other music metadata provider
        ↓
canonical artist + title + metadata
        ↓
YouTube search
        ↓
local ranking
```

Spotify is not an audio source.

Spotify should not be made a mandatory architectural dependency unless
its API access is verified and the project explicitly adopts it.

### 2.6 Downloader

The sync client uses:

``` text
yt-dlp
FFmpeg
```

The backend never downloads audio.

### 2.7 Sync Client

Current implementation:

``` text
Python
```

Python is used for filesystem operations, HTTP communication, subprocess
execution, testing and later packaging.

------------------------------------------------------------------------

## 3. High-Level Architecture

``` text
                    ┌───────────────────────┐
                    │       Telegram        │
                    │         Bot           │
                    └───────────┬───────────┘
                                │ HTTPS
                                ▼
                    ┌───────────────────────┐
                    │    Online Backend     │
                    │                       │
                    │ Telegram adapter      │
                    │ Authorization         │
                    │ Search                │
                    │ Library application    │
                    │ Sync API              │
                    │ Persistence           │
                    └───────────┬───────────┘
                                │
                              HTTPS
                                │
                                ▼
                    ┌───────────────────────┐
                    │     Sync Client       │
                    │                       │
                    │ Sync planner          │
                    │ Sync executor         │
                    │ USB filesystem        │
                    │ Downloader            │
                    └───────────┬───────────┘
                                │
                                ▼
                           USB / Music
```

The boundary is intentional:

``` text
ONLINE
──────────────────────────────
Telegram
Backend
Database
Search
Desired state


LOCAL
──────────────────────────────
Sync client
USB
Filesystem
yt-dlp
FFmpeg
Physical state
```

------------------------------------------------------------------------

## 4. Telegram Authorization

There is no MusicSync user-account system.

The Telegram Bot API supplies the sender's numeric User ID.

MusicSync compares it with:

``` text
AUTHORIZED_TELEGRAM_IDS
```

The authorization decision is made by the MusicSync application, not by
a login system.

Unauthorized updates should be ignored without a useful response.

The backend should not expose library contents, command help or
configuration information to unauthorized users.

This makes the project reusable: each deployment supplies its own bot
token and allowlist.

------------------------------------------------------------------------

## 5. Backend Responsibilities

The backend is responsible for:

-   Telegram webhook handling;
-   Telegram command parsing;
-   Telegram authorization;
-   search and candidate identification;
-   search ranking;
-   duplicate detection;
-   add/remove/list application logic;
-   persistent desired-library state;
-   synchronization API;
-   sync version management;
-   accepting synchronization reports;
-   validating YouTube URLs;
-   metadata retrieval.

The backend is not responsible for:

-   USB access;
-   Windows filesystem access;
-   Linux filesystem access;
-   MP3 downloading;
-   FFmpeg execution;
-   scanning physical files;
-   deciding whether a USB file physically exists.

------------------------------------------------------------------------

## 6. Domain Model

The domain contains only the concepts required by the current problem.

### Song

Represents the logical library item.

Conceptual fields:

``` text
id
artist
title
normalized_artist
normalized_title
version_type
youtube_url?
status
created_at
updated_at
```

`youtube_url` is optional because a Song imported from an existing USB
file may not have a known YouTube source.

### Track

Represents a physical file managed by MusicSync.

Conceptual fields:

``` text
id
song_id
relative_path
created_at
updated_at
```

A Track does not contain a live `missing` state.

The client discovers the current physical state by scanning the USB.

### SyncState

Represents synchronization metadata:

``` text
sync_version
last_sync_started_at
last_sync_completed_at
last_sync_status
```

The first version uses one global singleton state.

------------------------------------------------------------------------

## 7. No Source Entity

There is intentionally no `Source` entity in the first version.

The first version stores the selected YouTube URL directly on `Song`:

``` text
Song
 └── youtube_url
```

This keeps the persistence model small.

If future requirements need multiple persistent sources per Song, that
can be introduced later as an explicit architectural change.

The current architecture must not reintroduce `SourceRepository`,
`sources`, or a Song → Source → Track chain.

------------------------------------------------------------------------

## 8. Search Architecture

Search is designed to resemble a modern music search, especially
Spotify.

The system should not depend on exact wording.

### 8.1 Provider stage

The architecture separates search into two distinct provider interfaces:
1. `MetadataProvider`: Resolves unstructured queries into canonical
   metadata (Artist, Title, Version).
2. `SourceProvider`: Resolves canonical metadata or direct links into an
   audio source URL (e.g. YouTube URL) with stream information.

Implementations:

``` text
SpotifyMetadataProvider         optional, primary for fuzzy metadata resolution
YouTubeSearchMetadataProvider   fallback when Spotify is unavailable
YouTubeSourceProvider           current audio source provider
```

### 8.2 Identification stage

A `MetadataProvider` transforms an unclear query into:

``` text
artist
title
version
additional metadata
```

This clean canonical information is then passed to the `SourceProvider`
(e.g. YouTube) to find the precise audio stream.

### 8.3 Ranking stage

A local ranking component combines:

-   artist similarity;
-   title similarity;
-   token overlap;
-   word order;
-   spelling similarity;
-   accent/punctuation normalization;
-   version compatibility;
-   unwanted-term penalties;
-   provider relevance/popularity where available;
-   confidence.

The ranking should remain deterministic where practical.

The system should return at most three primary candidates.

------------------------------------------------------------------------

## 9. Normalization

Normalization is shared by search and duplicate detection.

Typical operations:

``` text
lowercase
accent normalization/removal
punctuation normalization
whitespace normalization
irrelevant suffix removal
```

Examples:

``` text
Get Lucky (Official Video)
        ↓
get lucky

GET LUCKY - Official Music Video
        ↓
get lucky
```

Normalization must never alter the original display metadata.

Meaningful version markers must be preserved.

------------------------------------------------------------------------

## 10. Version Detection

The application recognizes:

``` text
standard
cover
remix
acoustic
live
```

The normalization/ranking layer must distinguish meaningful variants.

For ordinary searches:

``` text
live
```

receives a strong exclusion/penalty unless explicitly requested.

A radio edit is normally treated as standard unless explicitly
distinguished.

------------------------------------------------------------------------

## 11. Duplicate Detection

Primary logical identity:

``` text
normalized_artist
+
normalized_title
+
version_type
```

Exact YouTube URL equality is also checked when a URL exists.

The same logical Song found through multiple YouTube uploads normally
remains one Song.

The selected URL is retained.

### Forced addition

`/force` is handled at the application level.

Because the first version stores one selected URL directly on Song and
has no Source collection, forcing a second URL for an already populated
logical Song is not represented as a second Source.

The implementation must therefore define a safe policy for this case,
for example requiring the user to explicitly choose whether the existing
Song's URL should be replaced. The database layer must not invent a
second source entity solely to satisfy `/force`.

------------------------------------------------------------------------

## 12. YouTube URL Validation

Validation is performed before:

-   metadata retrieval;
-   persistence;
-   downloading.

At minimum the accepted host patterns must include:

``` text
www.youtube.com
youtube.com
youtu.be
```

The parser must validate the hostname structurally rather than checking
whether the string merely contains `youtube.com`.

Invalid examples:

``` text
youtube.com.evil.example
evil.example/youtube.com/...
```

The exact confirmed user URL is preserved.

`/force` does not bypass validation.

------------------------------------------------------------------------

## 13. Telegram Flow

The backend receives:

``` text
POST /telegram/webhook
```

Flow:

``` text
Telegram
   ↓
Webhook adapter
   ↓
Parse update
   ↓
Check Telegram User ID
   ↓
Ignore if unauthorized
   ↓
Command/application service
   ↓
Database/provider
   ↓
Telegram response
```

Handlers must not contain raw SQL or domain business rules.

------------------------------------------------------------------------

## 14. Add Flow

``` text
Telegram
   ↓
query
   ↓
SearchService
   ↓
candidate providers
   ↓
ranking
   ↓
top 3
   ↓
user confirmation
   ↓
duplicate detection
   ↓
LibraryService
   ↓
Song persistence
   ↓
sync_version++
```

The physical USB is not accessed.

------------------------------------------------------------------------

## 15. Direct YouTube URL Flow

``` text
User URL
   ↓
URL validation
   ↓
metadata retrieval
   ↓
metadata normalization
   ↓
duplicate detection
   ↓
confirmation
   ↓
Song persistence
   ↓
sync_version++
```

The original URL is retained.

------------------------------------------------------------------------

## 16. Remove Flow

``` text
Telegram
   ↓
search/select Song
   ↓
explicit confirmation
   ↓
mark Song removed
   ↓
sync_version++
```

The physical Track is not immediately deleted.

The next synchronization reconciles the USB.

Soft removal allows the client to know which previously managed physical
path should be removed.

------------------------------------------------------------------------

## 17. Synchronization API

The API is intentionally small.

Current endpoints:

``` text
GET  /api/v1/sync/state
POST /api/v1/sync/report
```

There is no `/sync/start` endpoint.

Starting synchronization is a local client action.

### HTTPS

The API is an HTTP/REST API conceptually, but production traffic uses
HTTPS.

There is no reason to expose the production synchronization API over
plaintext HTTP.

HTTP may be used for controlled local development if needed.

------------------------------------------------------------------------

## 18. GET /api/v1/sync/state

Returns the desired library snapshot and its version.

Conceptually:

``` json
{
  "sync_version": 42,
  "desired_tracks": [
    {
      "song_id": 123,
      "artist": "Daft Punk",
      "title": "Get Lucky",
      "version_type": "standard",
      "youtube_url": "https://www.youtube.com/watch?v=...",
      "relative_path": "Daft Punk - Get Lucky.mp3"
    }
  ],
  "obsolete_tracks": []
}
```

Notice that `relative_path` is strictly relative to the configured
`MANAGED_FOLDER`, never prefixed with the folder name itself.

The exact JSON schema belongs in `API.md`.

A Song may have:

``` text
youtube_url = null
```

The client must not assume that every desired Song can be downloaded.

If a desired Song has no URL, it needs a later source-identification
step rather than an arbitrary YouTube search performed silently by the
sync client.

------------------------------------------------------------------------

## 19. POST /api/v1/sync/report

The client reports the result of synchronization.

The report must identify the desired-library version against which the
client worked.

Operations may include:

``` text
download
delete
import
```

The report must not allow an older synchronization to overwrite newer
desired state.

Example:

``` text
client synchronized version 42
backend is already version 43
```

The backend records the result without downgrading version 43.

USB-originated imports may cause a library mutation and therefore a new
`sync_version`.

------------------------------------------------------------------------

## 20. Sync Version Semantics

Every desired-library mutation is part of a versioned sequence.

Conceptually:

``` text
library version 41
       ↓
add Song
       ↓
library version 42
```

The client gets a snapshot:

``` text
DesiredState(version=42)
```

If the backend becomes version 43 during the run, the client does not
claim to have synchronized 43.

The backend remains authoritative.

The client may be asked to synchronize again later.

No distributed lock is required.

------------------------------------------------------------------------

## 21. Sync Client Architecture

The client is separated into:

``` text
BackendClient
SyncService
SyncPlanner
SyncExecutor
FileSystem
UsbScanner
FilenameParser
Downloader
Configuration
CLI
```

### BackendClient

Communicates with the backend API.

### SyncPlanner

Receives:

``` text
DesiredState
PhysicalState
```

and produces:

``` text
SyncPlan
```

### SyncExecutor

Executes the plan.

It does not decide what the plan should be.

### FileSystem

Abstracts filesystem operations that may differ between Windows and
future Linux implementations.

### Downloader

Abstracts audio download.

Current implementation:

``` text
YtDlpDownloader
```

------------------------------------------------------------------------

## 22. USB Scan

The scanner reads only the managed folder.

Example:

``` text
D:\
└── Music/
    ├── Daft Punk - Get Lucky.mp3
    ├── Queen - Don't Stop Me Now.mp3
    └── notes.txt
```

Only MP3 files are candidates for music synchronization.

`relative_path` is defined strictly relative to `MANAGED_FOLDER`.
For example, if `MANAGED_FOLDER=Music`, the file:
`D:\Music\Daft Punk - Get Lucky.mp3`
has:
`relative_path = "Daft Punk - Get Lucky.mp3"` (or `"Subfolder/Daft Punk - Get Lucky.mp3"`).
It must NEVER include the prefix `"Music/"`, ensuring that client
reconfigurations or multi-platform path roots do not invalidate database
records.

The scanner produces a physical representation containing information
such as:

``` text
relative_path
filename
artist
title
normalized_artist
normalized_title
version_type
```

It does not claim that an unknown file is managed merely because it is
inside the folder.

------------------------------------------------------------------------

## 23. Sync Planning

The planner compares desired and physical state.

Example:

``` text
Desired:
    A
    B
    C

USB:
    A
    B
    D

Plan:
    KEEP A
    KEEP B
    DOWNLOAD C
    IMPORT D
```

Deletion is allowed only when the physical file is confidently
associated with a managed Track and the Song is no longer desired.

Unknown files are protected.

The planner should be deterministic and highly testable.

### Dry-Run Mode

The CLI supports a `--dry-run` flag. In this mode:
1. The client fetches desired state from the backend.
2. The scanner inspects the physical USB.
3. The planner computes the full `SyncPlan`.
4. The CLI outputs a detailed preview table of scheduled operations
   (downloads, deletions, imports, warnings).
5. The executor is bypassed: no physical files are altered and no report
   is posted to the backend.

------------------------------------------------------------------------

## 24. Importing Existing USB Music

Import is not limited to the first ever synchronization.

It can happen whenever the client finds a USB file that is not known to
the database.

Important rule:

``` text
USB import does not require discovering a YouTube URL.
```

If the client can identify:

``` text
Artist
Title
Version
```

it can create/update the Song with:

``` text
youtube_url = null
```

The selected source can be added later.

This avoids unnecessary YouTube/API calls and makes synchronization
efficient.

------------------------------------------------------------------------

## 25. Track Persistence

The database stores only what is necessary to associate managed physical
files with Songs.

A Track stores:

``` text
song_id
relative_path
```

where `relative_path` is strictly relative to `MANAGED_FOLDER`, plus
timestamps and its own identifier.

It does not store:

-   USB volume label;
-   absolute Windows path;
-   live existence status;
-   `missing` status;
-   downloader information;
-   source entity;
-   duplicate metadata.

The current physical state is always obtained by scanning the USB.

------------------------------------------------------------------------

## 26. Download Process

Only one download is processed at a time.

Conceptually:

``` text
Song.youtube_url
      ↓
yt-dlp
      ↓
temporary file
      ↓
FFmpeg conversion
      ↓
final MP3
      ↓
controlled rename
```

Final name:

``` text
Artist - Title.mp3
```

Unsafe path characters are sanitized.

The downloader must not permit user-controlled paths to escape the
managed folder.

------------------------------------------------------------------------

## 27. Interrupted Downloads

A download must not create a file that looks complete before success.

Example:

``` text
Artist - Song.mp3.part
```

Only after success:

``` text
Artist - Song.mp3
```

If the process stops, the next run can detect temporary state and
recover safely.

A `.part` file is not a managed Track.

------------------------------------------------------------------------

## 28. Safe Destructive Operations

Before deleting a file, the client must establish:

1.  it is inside the configured managed folder;
2.  it is associated with a managed Track;
3.  its Song is no longer desired;
4.  the desired-state snapshot is complete and valid.

If confidence is insufficient:

``` text
DO NOT DELETE
```

Safety has priority over perfect cleanup.

------------------------------------------------------------------------

## 29. Backend Failure

If the client cannot obtain a complete desired state:

``` text
STOP
```

No destructive synchronization should occur.

The client should report a useful error.

------------------------------------------------------------------------

## 30. USB Failure

If the USB path is unavailable:

``` text
STOP
```

No filesystem changes occur.

------------------------------------------------------------------------

## 31. Logging

The client uses concise structured console logs.

Levels:

``` text
INFO
WARNING
ERROR
```

Example:

``` text
[INFO] Starting MusicSync
[INFO] Backend reachable
[INFO] USB found: D:\
[INFO] Scanned 42 MP3 files
[INFO] Downloading: Daft Punk - Get Lucky
[INFO] Download completed
[INFO] Synchronization completed
```

Secrets must never appear in logs.

------------------------------------------------------------------------

## 32. Repository Pattern

Database access is isolated behind repositories.

Current meaningful repositories:

``` text
SongRepository
TrackRepository
SyncStateRepository
```

There is intentionally no:

``` text
UserRepository
SourceRepository
```

Telegram authorization is configuration, not a persisted MusicSync user
entity.

The domain/application layer should not contain raw SQL.

------------------------------------------------------------------------

## 33. External Interfaces

Interfaces should exist only at meaningful substitution points.

Examples:

``` text
MetadataProvider
SourceProvider
Downloader
BackendClient
FileSystem
```

Possible implementations:

``` text
SpotifyMetadataProvider
YouTubeSearchMetadataProvider
YouTubeSourceProvider
YtDlpDownloader
WindowsFileSystem
FutureLinuxFileSystem
```

Not every class needs an interface.

------------------------------------------------------------------------

## 34. Error Codes

The synchronization API uses HTTP status codes together with structured
JSON error payloads.

Useful API responses include:

``` text
200 OK
400 Bad Request
401 Unauthorized (invalid or missing SYNC_TOKEN)
404 Not Found
409 Conflict (version mismatch)
500 Internal Server Error
503 Service Unavailable
```

Exact endpoint semantics and JSON error formats belong in `API.md`.

------------------------------------------------------------------------

## 35. Configuration and Secrets

Backend:

``` text
TELEGRAM_BOT_TOKEN
AUTHORIZED_TELEGRAM_IDS
YOUTUBE_API_KEY
SYNC_TOKEN
SPOTIFY_CLIENT_ID (optional)
SPOTIFY_CLIENT_SECRET (optional)
```

Client:

``` text
BACKEND_URL
SYNC_TOKEN
USB_PATH
MANAGED_FOLDER
```

Security model:
The sync API endpoints are protected using a static pre-shared key
(`SYNC_TOKEN`), transmitted via the standard HTTP header:
`Authorization: Bearer <SYNC_TOKEN>`.
This provides robust protection against unauthorized public access on
Cloudflare Workers without the overhead of user accounts or session
management.

------------------------------------------------------------------------

## 36. Project Structure

The repository should be organized approximately as:

``` text
MusicSync/
├── backend/
│   ├── src/
│   ├── migrations/
│   ├── tests/
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
│
├── client/
│   ├── src/
│   ├── tests/
│   ├── pyproject.toml
│   └── config.example.toml
│
├── docs/
│   ├── design/
│   │   ├── REQUIREMENTS.md
│   │   ├── ARCHITECTURE.md
│   │   ├── DATABASE.md
│   │   └── API.md
│   └── PROJECT_STRUCTURE.md
│
├── README.md
├── LICENSE
└── .gitignore
```

The exact source tree can evolve during implementation without changing
the domain boundaries.

------------------------------------------------------------------------

## 37. Future Linux Deployment

The filesystem boundary is deliberately isolated.

Current:

``` text
Windows
  ↓
WindowsFileSystem
  ↓
USB
```

Future:

``` text
Linux
  ↓
LinuxFileSystem
  ↓
USB
```

The synchronization planner, domain model and application rules should
not need to be rewritten merely because the operating system changes.

A future local deployment may also place:

``` text
Backend
Database
Sync Client
```

on the Linux server.

This remains a future deployment option, not a first-version
requirement.

------------------------------------------------------------------------

## 38. Maintainability Principles

The architecture follows:

> Design for change, not for speculation.

Rules:

-   small components;
-   explicit dependencies;
-   no giant service classes;
-   no unnecessary abstractions;
-   no framework-driven architecture;
-   pure logic where practical;
-   deterministic planning;
-   clear online/local boundary;
-   replaceable external providers where useful.

------------------------------------------------------------------------

## 39. Deliberately Excluded Complexity

The first version does not introduce:

-   microservices;
-   Kubernetes;
-   message brokers;
-   Redis;
-   WebSockets;
-   event sourcing;
-   CQRS;
-   distributed locks;
-   complex dependency-injection frameworks;
-   GUI frameworks;
-   automatic synchronization daemons;
-   runtime AI;
-   multiple user roles;
-   multiple active sync clients;
-   a Source persistence model;
-   a client authentication secret.

------------------------------------------------------------------------

## 40. Initial Implementation Order

Recommended order:

``` text
DATABASE.md
      ↓
API.md
      ↓
backend skeleton
      ↓
database repositories
      ↓
Telegram authorization/webhook
      ↓
Song add/remove/list
      ↓
search provider + ranking
      ↓
YouTube URL validation
      ↓
sync API
      ↓
client BackendClient
      ↓
USB scanner
      ↓
SyncPlanner
      ↓
SyncExecutor
      ↓
yt-dlp downloader
      ↓
USB import
      ↓
integration tests
      ↓
packaging
```

The project should not attempt to implement the entire system in one
step.

------------------------------------------------------------------------

## 41. Security Architecture & Threat Model

To guarantee the complete safety of the cloud database, the local host machine running downloads, and the destination playback hardware (e.g. car head units), the following mandatory security controls are established:

### 41.1 Database & Cloudflare Worker Security
- **No Direct Cloud Database Exposure:** Cloudflare D1 has no public IP or direct external database port. Access is mediated exclusively through Worker handlers, and direct administration is restricted to the owner's Cloudflare Dashboard or Wrangler CLI.
- **Timing-Safe Pre-Shared Key:** All sync endpoints require `Authorization: Bearer <SYNC_TOKEN>`. The Worker compares the provided token with the secret environment variable using constant-time comparison (`crypto.subtle.timingSafeEqual`) to prevent timing attacks.
- **Parameterized SQL:** All D1 database operations strictly use parameterized queries (`db.prepare(...).bind(...)`). Dynamic string concatenation in SQL statements is prohibited to eliminate SQL injection vectors.
- **Telegram Webhook Verification:** The Worker strictly validates the `X-Telegram-Bot-Api-Secret-Token` header set on Telegram webhooks and ignores updates from any Telegram user ID not listed in `AUTHORIZED_TELEGRAM_IDS`.

### 41.2 Local Client Execution Security
- **Strict Command-Line Isolation (No Shell Injection):**
  When invoking external CLI tools (`yt-dlp`, `FFmpeg`), Python's `subprocess.run` must be called with a strict argument list and **`shell=False`**. `os.system` and `shell=True` are strictly forbidden. Double-dash separators (`--`) must precede untrusted inputs (e.g. `["yt-dlp", "--", validated_url]`) to prevent option injection.
- **URL Domain Whitelisting:**
  The client must strictly validate that download URLs belong exclusively to official YouTube domains (`https://www.youtube.com/...`, `https://youtu.be/...`) via regular expressions before invoking any downloader. Non-HTTP protocols (`file://`, `gopher://`, etc.) and internal loopback addresses (`localhost`, `127.0.0.1`, RFC 1918 IPs) are rejected.
- **Path Traversal Prevention:**
  Filenames derived from track metadata or backend paths must be sanitized (removing path separators `/`, `\`, and relative navigation tokens `..`). The client must verify that the canonical destination path resides strictly inside `MANAGED_FOLDER` (e.g. using `os.path.commonpath([resolved_dest, managed_folder]) == managed_folder`).

### 41.3 Playback Hardware & Audio File Safety
- **Car Stereo / Media Player Compatibility:**
  Embedded players often run minimal or legacy firmware vulnerable to buffer overflows or crashing when parsing malformed audio metadata.
  - The client writes standard **ID3v2.3** tags (UTF-16/ISO-8859-1 compatible).
  - Text metadata fields (Artist, Title, Album) are strictly length-capped (maximum 128 characters) and stripped of non-printable control characters.
  - Corrupt or partially downloaded files are staged in temporary working directories and atomically moved to the destination only after integrity validation.


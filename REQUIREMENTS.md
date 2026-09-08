# MusicSync --- Requirements

## 1. Project Overview

**Project name:** MusicSync

**Description:**

> A lightweight, open-source music library synchronizer controlled
> through Telegram.

MusicSync is a lightweight system for remotely managing a music library
through Telegram and synchronizing that library with a physical USB
drive.

The system is composed of two logically independent parts:

1.  an **online backend**, responsible for the music library, Telegram
    bot and persistent database;
2.  a **sync client**, currently implemented for Windows, manually
    launched by the user to synchronize the online library with a
    physical USB drive.

The sync client does not need to run continuously.

The online backend does not require access to the USB drive.

When the future Linux server is available again, the same
synchronization responsibilities should be portable to a Linux client
running on that server. This does not require a second client
implementation in the first release.

The project must remain reusable by other users: another person should
be able to deploy MusicSync with their own Telegram bot, authorized
Telegram IDs, backend configuration and USB drive.

------------------------------------------------------------------------

## 2. Goals

### 2.1 Primary goals

MusicSync must:

1.  Allow authorized Telegram users to manage a shared music library.
2.  Allow users to search for songs from a natural, imperfect
    description and select the correct result.
3.  Make the search experience feel as close as reasonably possible to a
    modern music search such as Spotify.
4.  Store the desired music library in persistent online storage.
5.  Allow the sync client to reconcile the desired library with a
    physical USB drive.
6.  Allow songs to be added and removed remotely even when the USB is
    disconnected.
7.  Import existing or manually added USB music into the online library
    when possible.
8.  Avoid accidental duplicate songs.
9.  Recover safely from interrupted synchronization operations.
10. Require no paid service for core functionality.
11. Remain simple to deploy and maintain.

### 2.2 Secondary goals

The architecture should make it possible to add later:

-   a web interface;
-   additional search providers;
-   additional music metadata providers;
-   additional download providers;
-   Linux/macOS synchronization clients;
-   alternative database implementations;
-   local or hybrid backend deployment.

These are extension points, not first-release requirements.

------------------------------------------------------------------------

## 3. Non-Goals

The first version does not need to provide:

-   a graphical user interface;
-   a web interface;
-   a mobile application;
-   music streaming;
-   music playback;
-   audio/video delivery through Telegram;
-   multiple USB drives;
-   album management;
-   playlists;
-   advanced audio metadata management;
-   cloud storage for audio files;
-   paid APIs;
-   AI-based song recognition as a runtime requirement;
-   continuous USB polling;
-   a permanently running Windows client;
-   a permanently running home server;
-   complex backup infrastructure;
-   multiple permission levels;
-   multiple active synchronization clients.

------------------------------------------------------------------------

## 4. High-Level Architecture

MusicSync is divided into an online backend and a local synchronization
client.

``` text
                         INTERNET
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Online Backend    │
                 │                     │
                 │  Telegram Bot       │
                 │  Search             │
                 │  Library            │
                 │  Database           │
                 │  Sync API           │
                 └──────────┬──────────┘
                            │
                         HTTPS
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Sync Client       │
                 │                     │
                 │  Windows now        │
                 │  Linux later        │
                 │  Manual execution   │
                 └──────────┬──────────┘
                            │
                            ▼
                      ┌───────────┐
                      │    USB    │
                      │ managed   │
                      │  folder   │
                      └───────────┘
```

The online database represents the desired library.

The USB represents the actual physical state.

The sync client reconciles the two.

The backend should not become dependent on Windows-specific filesystem
behavior.

------------------------------------------------------------------------

## 5. Desired State and Actual State

The online database is the persistent source of truth for the **desired
music library**.

The USB is the source of truth for the **current physical contents**.

Conceptually:

``` text
Desired State
     │
     ▼
Online Database
     │
     │ synchronization
     ▼
USB Physical State
```

Telegram changes the desired state immediately.

The USB is changed only when the sync client is manually executed.

The database must not be treated as a complete cached representation of
the USB. The sync client scans the managed folder during each
synchronization.

------------------------------------------------------------------------

## 6. Cost and Open Source

The project must be usable with a zero-euro budget.

Free services and APIs may be used when appropriate, including services
with reasonable rate limits.

No paid service may be required for core functionality.

MusicSync is open source and will use the MIT license unless this
decision is changed later.

The project should avoid unnecessary proprietary dependencies.

------------------------------------------------------------------------

## 7. Telegram Users and Authorization

MusicSync does not have a user-account system.

Telegram supplies the identity of the sender through the numeric
Telegram User ID.

MusicSync maintains an allowlist:

``` text
AUTHORIZED_TELEGRAM_IDS
```

There is only one authorization level in the first version:

``` text
AUTHORIZED
```

There are no administrator/moderator roles.

### 7.1 Unauthorized users

An unauthorized user must be unable to do anything through MusicSync.

In particular, an unauthorized user must not be able to:

-   add songs;
-   remove songs;
-   list the library;
-   use `/force`;
-   search through MusicSync;
-   trigger synchronization-related operations;
-   obtain useful information about the MusicSync library or
    configuration.

Ideally MusicSync should not respond to unauthorized messages at all.

Telegram itself may still allow the person to open or message the bot;
MusicSync cannot prevent Telegram from accepting the chat. The
application should simply ignore unauthorized updates.

This authorization model must remain reusable: another person deploying
MusicSync configures their own bot token and their own
`AUTHORIZED_TELEGRAM_IDS`.

------------------------------------------------------------------------

## 8. Core Domain Concepts

MusicSync uses three concepts:

### 8.1 Song

A `Song` represents the logical music item in the desired library.

Example:

``` text
Artist: The Beatles
Title: Let It Be
Version: standard
```

A Song may initially have no known YouTube URL, for example when it is
imported from an existing USB file.

### 8.2 Track

A `Track` represents a physical MP3 file managed by MusicSync on the
USB.

Example:

``` text
Music/The Beatles - Let It Be.mp3
```

Conceptually:

``` text
Song
  │
  └── Track
```

There is deliberately no separate `Source` entity in the first version.
The selected YouTube URL is stored directly on the Song when known.

### 8.3 Sync State

`sync_state` stores synchronization metadata such as the desired-library
version and the last synchronization status.

It does not represent individual tracks.

------------------------------------------------------------------------

## 9. USB Configuration

The USB physical name or volume label is irrelevant.

The local path is configurable.

Example:

``` text
USB_PATH=D:\
```

is only an example.

A separate managed folder is also configurable:

``` text
MANAGED_FOLDER=Music
```

Only the managed folder may be modified.

Everything else on the USB must be ignored.

Example:

``` text
D:\
├── Music/          ← managed
├── Documents/      ← ignored
├── Photos/         ← ignored
└── random.txt      ← ignored
```

------------------------------------------------------------------------

## 10. USB Availability

The USB does not need to remain connected.

If it is disconnected:

-   Telegram remains usable;
-   the online library remains usable;
-   the sync client must not modify the filesystem;
-   synchronization is postponed until the USB is available.

The user reconnects the USB and runs the client again.

Continuous USB detection is not required.

------------------------------------------------------------------------

## 11. Supported Audio

The first version supports MP3.

The client downloads/converts managed music to MP3.

The first version does not require:

-   configurable bitrate;
-   configurable audio quality;
-   album artwork;
-   genre;
-   year;
-   track number;
-   album metadata.

------------------------------------------------------------------------

## 12. Existing USB Content and Import

The USB may already contain music when MusicSync is first used.

The database may be:

-   empty;
-   partially populated;
-   already populated.

The first synchronization must not assume that the database is empty.

The client scans the managed folder and attempts to identify MP3 files.

A common filename format is:

``` text
Artist - Title.mp3
```

If identification succeeds:

``` text
USB file
   ↓
Song
   ↓
Track
```

The Song may have:

``` text
youtube_url = NULL
```

because the YouTube source is not known.

MusicSync must not perform unnecessary YouTube searches merely to
discover a URL for every pre-existing USB track.

Finding a YouTube source for an imported track can be performed later,
if and when needed.

If identification is partial, the available information may be stored.

Example:

``` text
Artist: Unknown
Title: Some Song
```

The physical file must not be deleted merely because identification is
imperfect.

This import/reconciliation task is a normal part of the architecture,
but its implementation may be postponed until after the core backend and
synchronization flow are working.

------------------------------------------------------------------------

## 13. Manually Added USB Files

If a user manually places an MP3 inside the managed folder:

1.  the sync client detects it;
2.  it attempts to identify artist/title/version;
3.  if it can identify the Song, it imports the Song into the database;
4.  the physical file remains on the USB;
5.  a Track association is created;
6.  the Song may have no YouTube URL.

If only partial identification is possible, the available information
may be imported.

A manually added file must not be deleted simply because it was not
previously known by MusicSync.

------------------------------------------------------------------------

## 14. Manually Removed Managed Files

If a previously managed Track disappears from the managed USB folder,
the client must detect that physical state has changed.

The behavior must be handled by synchronization logic.

The database must not blindly pretend that the physical file still
exists.

The system must also avoid confusing a manually removed managed file
with an unknown file.

------------------------------------------------------------------------

## 15. Song Search

Users search using free text.

Examples:

``` text
pastello bianco pinguini
```

``` text
quella dei coldplay che fa something...
```

``` text
pink floyd another brick
```

The search should tolerate:

-   spelling mistakes;
-   missing accents;
-   minor formatting differences;
-   word-order variations;
-   incomplete descriptions;
-   common punctuation differences.

### 15.1 Spotify-like search objective

The search experience should resemble Spotify as closely as reasonably
possible.

The goal is not merely exact string matching. A vague or imperfect user
description should still have a good chance of producing the intended
song.

The implementation should investigate whether Spotify's APIs can improve
this process.

A possible flow is:

``` text
User's confused description
        ↓
Search / identification provider
        ↓
canonical artist/title/metadata candidates
        ↓
YouTube search
        ↓
local ranking
        ↓
Top 3 MusicSync candidates
```

Spotify may be used as an optional search/metadata provider if its API
access and terms are suitable for the deployment.

Spotify must not become a mandatory runtime dependency unless that
decision is explicitly made later.

Spotify would be used for identification/metadata, not as the audio
download source.

If Spotify cannot be used, MusicSync must still have a functional search
path using other providers.

------------------------------------------------------------------------

## 16. Search Results and Ranking

The bot should present up to three relevant results.

The ranking should aim to approximate a Spotify-like relevance
experience.

Potential signals include:

1.  artist relevance;
2.  title relevance;
3.  exact/near-exact matches;
4.  token overlap;
5.  word order;
6.  spelling similarity;
7.  popularity/relevance supplied by a provider when available;
8.  compatibility with requested version;
9.  exclusion of inappropriate versions such as live recordings for
    ordinary searches;
10. confidence.

The ranking should be deterministic where practical.

AI is not required for runtime ranking.

However, provider-based metadata/identification may be used if it
materially improves search quality.

Low-confidence but potentially useful results should still be shown when
no better candidates exist.

------------------------------------------------------------------------

## 17. Search Interaction

Each result should show, when available:

-   title;
-   artist;
-   version information;
-   YouTube URL;
-   Telegram's native YouTube preview when possible.

Each candidate should provide:

``` text
[✅ È questa]
[❌ No]
```

If the user rejects a candidate, the next candidate should be shown when
available.

If no useful candidate remains, MusicSync asks for a more precise
description or a direct YouTube URL.

------------------------------------------------------------------------

## 18. Version Handling

Meaningful versions must remain distinguishable.

The first version recognizes at least:

``` text
standard
cover
remix
acoustic
live
```

### Covers

A cover is a different logical Song from the original.

### Remixes

A remix is a different logical Song/version.

### Acoustic

An acoustic version is a different logical Song/version.

### Radio edits

A radio edit is considered the same logical Song as the standard version
unless the user explicitly requires it as distinct.

### Live

Live versions are excluded from ordinary searches and should not
normally substitute for studio recordings.

Normalization must not erase meaningful version distinctions.

------------------------------------------------------------------------

## 19. Song Identity and Duplicates

The primary logical identity is:

``` text
normalized_artist
+
normalized_title
+
version_type
```

Normalization removes irrelevant presentation differences such as:

``` text
Official Video
Official Music Video
Lyrics
Audio
```

but must preserve meaningful version distinctions.

The exact same YouTube URL should not normally create another library
item.

Different YouTube uploads of the same logical song should normally refer
to the same Song.

The selected YouTube URL is retained when one is known.

Because the first-release model stores one selected YouTube URL directly
on Song, `/force` is an explicit exception mechanism for duplicate
protection, but it does not create a second `Source` entity. The exact
behavior when a forced URL conflicts with an already-populated Song URL
must be defined by the application layer rather than by introducing a
new persistence entity.

------------------------------------------------------------------------

## 20. Direct YouTube URLs

Supported formats include at minimum:

``` text
https://www.youtube.com/watch?v=...
https://youtube.com/watch?v=...
https://youtu.be/...
```

The backend must validate that the host is genuinely an allowed YouTube
host.

It must reject lookalike URLs such as:

``` text
https://youtube.com.evil.example/...
https://evil.example/youtube.com/...
```

Validation must occur before metadata retrieval and persistence.

The exact user-supplied URL is preserved after confirmation.

MusicSync must not silently replace it with another upload.

If the URL is invalid, unsupported or unusable, the user must be
informed.

------------------------------------------------------------------------

## 21. Forced Addition

Command:

``` text
/force <youtube-link>
```

`/force` exists to allow explicit user intent when normal duplicate
detection would reject an addition.

It does not bypass:

-   Telegram authorization;
-   YouTube URL validation;
-   metadata validation;
-   database integrity rules.

It must never become a mechanism for accepting arbitrary URLs.

------------------------------------------------------------------------

## 22. Telegram Commands

The first version supports:

``` text
/add
/aggiungi

/remove
/rimuovi

/list
/lista

/help
/aiuto

/force <youtube-link>
```

There is no `/sync` command.

Synchronization is a local client operation.

All bot messages are in Italian.

Commands are available in Italian and English where defined above.

------------------------------------------------------------------------

## 23. Add Flow

Typical flow:

``` text
User
 ↓
/add query
 ↓
Search
 ↓
Top candidates
 ↓
User confirms
 ↓
Duplicate check
 ↓
Create/update Song
 ↓
Increment sync_version
```

The USB is not touched.

The database changes immediately.

------------------------------------------------------------------------

## 24. Remove Flow

Typical flow:

``` text
User
 ↓
/remove
 ↓
Search/select Song
 ↓
Confirm
 ↓
Song marked removed
 ↓
Increment sync_version
```

The physical USB is not touched by Telegram.

During the next synchronization, the associated managed Track may be
removed.

Removal requires explicit confirmation.

Soft removal is used so that the relationship with an existing
Track/path is not lost before the physical USB is reconciled.

------------------------------------------------------------------------

## 25. Library Listing

`/list` and `/lista` display the desired library.

A simple representation is sufficient:

``` text
Artist - Title
```

Pagination may be added if needed.

------------------------------------------------------------------------

## 26. Synchronization

Synchronization is manually started by the user.

The sync client must:

1.  load and validate configuration;
2.  verify backend connectivity;
3.  fetch the current desired state and its `sync_version`;
4.  verify the USB path;
5.  scan only the managed folder;
6.  identify physical MP3 files;
7.  compare desired and physical state;
8.  import USB-only files when possible;
9.  download desired tracks that are missing;
10. remove obsolete managed tracks;
11. leave unknown/unrelated files untouched;
12. report USB-originated changes;
13. report the synchronized version/result;
14. finish safely if the backend changed during synchronization.

The exact operation order must be defined so that destructive operations
are not performed before the client has a complete and valid
desired-state snapshot.

------------------------------------------------------------------------

## 27. Synchronization Version

The desired library has a monotonically increasing:

``` text
sync_version
```

Every desired-library mutation increments the version.

Example:

``` text
41
 ↓ add
42
 ↓ remove
43
```

The client synchronizes against a specific version.

If the backend changes during synchronization:

``` text
client fetched 42
backend becomes 43
client completes work based on 42
```

the client must report that it synchronized version 42.

An old result must never overwrite or downgrade a newer backend version.

------------------------------------------------------------------------

## 28. Backend Availability During Sync

If the backend cannot be reached or the client cannot obtain a complete
desired-state snapshot:

``` text
STOP
```

No destructive USB operation should be performed based on incomplete or
stale information.

The user can retry later.

------------------------------------------------------------------------

## 29. USB Availability During Sync

If the configured USB path is unavailable:

``` text
STOP
```

No filesystem modifications are performed.

------------------------------------------------------------------------

## 30. Downloading

The client uses:

-   yt-dlp;
-   FFmpeg.

Downloads are sequential: one track at a time.

The selected YouTube URL is used.

The backend never downloads audio.

A successful download results in an MP3.

A failed download is not treated as successful synchronization.

No complex automatic retry system is required.

------------------------------------------------------------------------

## 31. Interrupted Downloads

Downloads must use temporary/incomplete files.

Example:

``` text
Artist - Song.mp3.part
```

Only after successful completion should the final filename exist:

``` text
Artist - Song.mp3
```

A `.part` file is never considered a completed managed Track.

The next run must be able to recover safely.

------------------------------------------------------------------------

## 32. USB Filename and Filesystem Rules

Expected canonical filename:

``` text
Artist - Title.mp3
```

Unsafe filesystem characters must be sanitized.

The implementation must ensure that generated paths remain inside the
configured managed folder.

Path traversal must never be possible through song metadata.

Files outside the managed folder must never be modified.

------------------------------------------------------------------------

## 33. Physical Track Model

A Track represents the association:

``` text
Song
  ↕
relative_path
```

The database does not attempt to store a full live representation of the
USB.

The client scans the USB on each synchronization.

A Track record exists mainly so MusicSync can distinguish a previously
managed physical file from an unknown/manual file.

------------------------------------------------------------------------

## 34. Operation Logging

A lightweight operation log may be used for troubleshooting.

Possible operations:

``` text
ADD
REMOVE
DOWNLOAD
IMPORT
SYNC
FAILURE
```

This must not evolve into event sourcing.

------------------------------------------------------------------------

## 35. Concurrency

The first version assumes:

``` text
one active sync client
```

Multiple authorized Telegram users may modify the desired library.

Library mutations must be persisted consistently.

No distributed lock or complex multi-client synchronization protocol is
required.

Version checks are sufficient for the first release.

------------------------------------------------------------------------

## 36. Error Handling

Important errors include:

-   unauthorized Telegram user;
-   invalid YouTube URL;
-   duplicate Song;
-   forced addition;
-   unavailable YouTube source;
-   backend unavailable;
-   USB unavailable;
-   download failure;
-   conversion failure;
-   interrupted synchronization;
-   invalid configuration;
-   unidentified USB file;
-   manually removed managed file.

Errors should fail safely.

Telegram messages should be concise and actionable.

Internal implementation details should not be unnecessarily exposed.

------------------------------------------------------------------------

## 37. Windows Client

The current client is a console application.

The user launches it manually.

Example:

``` text
MusicSync.exe
```

Expected lifecycle:

``` text
start
 ↓
validate configuration
 ↓
connect to backend
 ↓
verify USB
 ↓
synchronize
 ↓
print result
 ↓
exit
```

No GUI, tray application, Windows service, background daemon, automatic
startup or polling loop is required.

------------------------------------------------------------------------

## 38. Future Linux Client

When the Linux server is repaired/replaced, the synchronization client
should be portable to Linux.

The architecture should separate:

``` text
sync logic
download logic
filesystem abstraction
```

from Windows-specific path handling.

The future arrangement may be:

``` text
Linux server
├── sync client
└── USB
```

and, independently, the backend may also be moved to or run locally on
that server in the future.

Neither future arrangement needs to be implemented in the first release.

------------------------------------------------------------------------

## 39. Backend Deployment

The first deployment is expected to use an online backend.

Cloudflare Workers + D1 is the current implementation choice.

This is a deployment decision, not a permanent architectural dependency.

The architecture must leave open the possibility of running the backend
locally in the future.

The first release must not require a home server.

------------------------------------------------------------------------

## 40. Network Security

The API is an HTTP/REST API at the application level.

Production network communication must use:

``` text
HTTPS
```

HTTP without TLS is only acceptable for controlled local development
where appropriate.

Telegram webhook traffic must use HTTPS.

The client-to-backend API must use HTTPS in production.

------------------------------------------------------------------------

## 41. Configuration

Backend configuration must support at least:

``` text
TELEGRAM_BOT_TOKEN
AUTHORIZED_TELEGRAM_IDS
YOUTUBE_API_KEY
```

Optional search-provider credentials may be added if a provider such as
Spotify is used.

Client configuration must support:

``` text
BACKEND_URL
USB_PATH
MANAGED_FOLDER
```

No client secret is required in the first version.

Secrets must never be committed to source control.

------------------------------------------------------------------------

## 42. External Services

The first version may use free services for:

-   Telegram communication;
-   YouTube search;
-   YouTube metadata;
-   optional Spotify search/metadata;
-   audio downloading;
-   online hosting;
-   persistent database.

External providers should be hidden behind meaningful interfaces when
doing so keeps the architecture replaceable.

No paid provider may be mandatory.

------------------------------------------------------------------------

## 43. Testing

Automated tests must cover at least:

-   normalization;
-   Song identity;
-   duplicate detection;
-   version detection;
-   search ranking;
-   provider integration through fakes/mocks;
-   database operations;
-   Telegram authorization;
-   URL validation;
-   USB file discovery;
-   filename parsing;
-   sync planning;
-   sync state transitions;
-   interrupted downloads;
-   error handling.

Normal tests must not depend on live Telegram, YouTube or Spotify
services.

------------------------------------------------------------------------

## 44. Maintainability

MusicSync should favor:

-   small classes;
-   clear responsibilities;
-   explicit dependencies;
-   simple data flow;
-   minimal global state;
-   dependency injection where useful;
-   interfaces only at meaningful substitution points.

SOLID principles should be applied without creating abstractions that
have no practical value.

The codebase should remain understandable by a single developer.

------------------------------------------------------------------------

## 45. Extensibility

The architecture should permit:

``` text
Telegram
    ↓
Future Web UI
```

``` text
Windows Sync Client
Linux Sync Client
macOS Sync Client
```

``` text
Current database
Future database
```

``` text
YouTube
Spotify
Other metadata/search providers
```

``` text
yt-dlp
Future downloader
```

Future additions should not require rewriting the core domain model.

------------------------------------------------------------------------

## 46. Definition of Done --- First Version

The first version is functionally complete when an authorized user can:

1.  configure a Telegram bot;
2.  configure authorized Telegram User IDs;
3.  deploy the backend;
4.  configure the Windows USB path;
5.  configure the managed folder;
6.  search for songs through Telegram;
7.  receive up to three relevant candidates;
8.  confirm a candidate;
9.  add a Song to the desired library;
10. remove a Song;
11. list the desired library;
12. provide a direct validated YouTube URL;
13. use `/force`;
14. manually launch the sync client;
15. synchronize desired and physical state;
16. import existing USB music without requiring YouTube lookup;
17. import manually added USB files when identifiable;
18. download missing Songs as MP3;
19. remove obsolete managed Tracks;
20. leave unrelated files untouched;
21. safely handle disconnected USB;
22. safely handle unavailable backend;
23. recover from interrupted downloads;
24. prevent unauthorized users from interacting with the library;
25. operate with free/open-source core components.

------------------------------------------------------------------------

## 47. Design Principle

MusicSync follows:

> **Design for change, not for speculation.**

Today's boundaries must make tomorrow's changes possible, but future
components must not be implemented merely because they might someday be
useful.

The first implementation should remain small, reversible and
understandable.

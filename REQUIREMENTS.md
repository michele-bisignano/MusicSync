# MusicSync --- Requirements

## 1. Project Overview

**Project name:** MusicSync

**Description:**

> A lightweight, open-source music library synchronizer controlled
> through Telegram.

MusicSync remotely manages a desired music library through Telegram and
synchronizes it with a physical USB drive.

The system consists of:

1.  an online backend containing the Telegram bot and persistent
    database;
2.  a Windows synchronization client, manually launched by the user.

The Windows client does not need to run continuously.

The backend does not access the physical USB drive.

------------------------------------------------------------------------

## 2. Goals

MusicSync must:

1.  allow authorized users to manage a shared music library through
    Telegram;
2.  allow users to search for Songs and select the correct source;
3.  store the desired library in an online persistent database;
4.  synchronize the desired library with a physical USB drive;
5.  allow remote add/remove operations while the USB is disconnected;
6.  import manually added USB music when possible;
7.  avoid unintended duplicates;
8.  recover safely from interrupted synchronization;
9.  require no paid services;
10. remain simple to deploy and maintain.

------------------------------------------------------------------------

## 3. Non-Goals

The first version does not require:

-   a Windows GUI;
-   a web interface;
-   a mobile application;
-   streaming or playback;
-   multiple USB drives;
-   advanced metadata management;
-   playlists;
-   configurable audio quality;
-   paid APIs;
-   AI-based song recognition;
-   continuous USB polling;
-   a permanently running Windows client;
-   a permanently running home server;
-   complex backup infrastructure;
-   multiple permission levels;
-   complex user or client authentication.

------------------------------------------------------------------------

## 4. Authorization

Telegram is the only user-facing control interface.

Every protected Telegram operation must verify the sender's **numeric
Telegram User ID**.

Telegram usernames are not used for authorization.

The first version has one authorization level:

``` text
AUTHORIZED
```

There is no MusicSync user account system.

Authorized Telegram User IDs are configured through
`AUTHORIZED_TELEGRAM_IDS`.

Unauthorized users must not be able to:

-   add Songs;
-   remove Songs;
-   force-add Songs;
-   inspect the library;
-   trigger protected operations.

The Windows client does not authenticate as a user.

------------------------------------------------------------------------

## 5. Architecture Responsibilities

### Online backend

The backend is responsible for:

-   Telegram communication;
-   Telegram authorization;
-   song search;
-   source selection;
-   YouTube URL validation;
-   library management;
-   duplicate detection;
-   persistent storage;
-   synchronization API.

The backend must not access the physical USB drive.

### Windows client

The Windows client is responsible for:

-   accessing the physical USB drive;
-   scanning the managed folder;
-   downloading missing Tracks;
-   removing obsolete managed Tracks;
-   importing manually added Tracks;
-   reconciling physical state with desired state.

The client is manually launched and exits after synchronization.

------------------------------------------------------------------------

## 6. Desired and Actual State

The online database is the source of truth for the **desired music
library**.

The USB represents the **actual physical state**.

``` text
Telegram
   ↓
Backend
   ↓
Online DB
   ↓
Desired State
   ↓
Windows Client
   ↓
USB
   ↓
Actual State
```

Telegram changes the desired state immediately.

The USB is updated the next time the Windows client runs.

------------------------------------------------------------------------

## 7. USB Configuration

The USB path must be configurable.

The USB volume label is irrelevant.

Example:

``` text
USB_PATH=D:```

This is only an example.

The managed folder must also be configurable.

Example:

```text
MANAGED_FOLDER=Music
```

Only the managed folder may be modified.

Files outside it must never be modified or deleted.

------------------------------------------------------------------------

## 8. USB Availability

The USB does not need to remain connected.

If the configured USB path is unavailable:

-   Telegram remains usable;
-   the online library remains available;
-   the Windows client performs no filesystem operations;
-   synchronization is postponed until a later run.

Continuous USB detection is not required.

------------------------------------------------------------------------

## 9. Audio Format

The first version supports:

``` text
MP3
```

Album, genre, year, artwork, and track number are not required.

------------------------------------------------------------------------

## 10. Existing and Manual USB Content

On the first synchronization, existing MP3 files in the managed folder
should be imported when possible.

MusicSync should attempt to extract artist and title from filenames such
as:

``` text
Artist - Title.mp3
```

Partial identification is allowed.

A manually added MP3 inside the managed folder must:

1.  be detected;
2.  be identified when possible;
3.  be imported into the online library when identified;
4.  remain on the USB;
5.  become managed once imported.

Files that cannot be confidently identified must not be blindly deleted.

------------------------------------------------------------------------

## 11. Search

Users search using free text.

Search should tolerate:

-   spelling mistakes;
-   missing accents;
-   minor formatting differences;
-   word-order variations.

The bot presents up to three relevant results.

Ranking should prioritize:

1.  artist/title relevance;
2.  exact or near-exact title matches;
3.  exact or near-exact artist matches;
4.  relevance/popularity;
5.  requested version compatibility;
6.  non-live results for ordinary searches.

The ranking should be deterministic and must not require AI.

------------------------------------------------------------------------

## 12. Version Handling

Meaningfully different recordings remain distinct.

These are distinct:

``` text
Original
Cover
Remix
Acoustic
Live
```

Radio edits are considered the same logical Song as the standard version
unless explicitly required otherwise.

Live versions should be excluded from ordinary searches.

------------------------------------------------------------------------

## 13. Song Identity and Duplicates

The primary logical identity is:

``` text
normalized Artist
+
normalized Title
+
version type
```

Normalization removes irrelevant presentation differences such as:

``` text
Official Video
Official Music Video
Lyrics
Audio
```

Meaningful version distinctions must not be removed.

Multiple artists are stored as one artist string, for example:

``` text
Lady Gaga & Bruno Mars
```

The exact same YouTube URL must not normally create a second library
entry.

Different uploads representing the same logical Song should preferably
resolve to the same Song.

------------------------------------------------------------------------

## 14. YouTube URL Validation

Any direct YouTube URL supplied by the user must be validated by the
backend **before metadata retrieval and before persistence**.

At minimum, supported forms include:

``` text
https://www.youtube.com/watch?v=...
https://youtube.com/watch?v=...
https://youtu.be/...
```

Lookalike domains and unrelated URLs must be rejected.

For example:

``` text
https://youtube.com.evil.example/...
https://evil.example/youtube.com/...
```

must not be accepted.

The exact user-supplied URL is preserved after confirmation.

The Windows client must never download an arbitrary user-provided URL.

Only YouTube URLs that have passed backend validation and are stored in
the online database may be used for downloads.

------------------------------------------------------------------------

## 15. Direct YouTube Flow

When a direct YouTube URL is supplied:

``` text
URL
 ↓
Validate
 ↓
Retrieve metadata
 ↓
Normalize metadata
 ↓
Duplicate check
 ↓
Show result
 ↓
User confirms
 ↓
Save exact URL
```

If the URL is invalid, unavailable, or unsuitable, the user is informed.

The system must never silently replace the supplied URL.

------------------------------------------------------------------------

## 16. Forced Addition

The command:

``` text
/force <youtube-link>
```

allows the user to explicitly bypass normal duplicate detection.

`/force` does **not** bypass:

-   Telegram authorization;
-   YouTube URL validation;
-   basic metadata validation;
-   database integrity rules.

------------------------------------------------------------------------

## 17. Telegram Commands

Supported commands:

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

There is no Telegram `/sync` command.

All bot messages are written in Italian.

------------------------------------------------------------------------

## 18. Add and Remove

Adding a Song requires user confirmation.

Search results should contain, when available:

-   title;
-   artist;
-   YouTube URL;
-   Telegram's native YouTube preview.

Inline controls:

``` text
[✅ È questa]
[❌ No]
```

Removing a Song also requires explicit confirmation.

Telegram changes the online desired library immediately.

The USB is changed only during the next Windows synchronization.

------------------------------------------------------------------------

## 19. Database

The online database contains only the information required by MusicSync.

The simplified model is:

``` text
songs
tracks
sync_state
```

There is no users table.

There is no sources table.

The definitive YouTube URL is stored directly on the Song.

The database does not persist a `missing` physical state; the Windows
client derives physical state by scanning the USB during
synchronization.

------------------------------------------------------------------------

## 20. Synchronization

Synchronization is manually triggered by launching the Windows client.

The client must:

1.  validate configuration;
2.  verify the USB path;
3.  retrieve the current desired library;
4.  retrieve `sync_version`;
5.  scan the managed folder;
6.  compare desired and physical state;
7.  import USB-only files when possible;
8.  download missing Tracks;
9.  remove obsolete managed Tracks;
10. leave unrelated files untouched;
11. report USB-originated changes;
12. record synchronization state.

If the backend or USB is unavailable, synchronization fails safely.

------------------------------------------------------------------------

## 21. Synchronization Safety

The client must:

-   modify only the managed folder;
-   never delete outside the managed folder;
-   avoid deleting unidentified/manual files;
-   avoid treating incomplete downloads as completed;
-   avoid creating duplicate Songs;
-   avoid overwriting newer backend state with an older synchronization
    result.

Downloads use temporary files and become valid Tracks only after
successful completion.

------------------------------------------------------------------------

## 22. Synchronization Version

The backend maintains a monotonically increasing `sync_version`.

If the client synchronizes version 12 while Telegram changes the library
to version 13, the client must report version 12.

The backend must keep version 13 as the current desired state.

The next synchronization reconciles version 13.

------------------------------------------------------------------------

## 23. Downloads

The Windows client uses an open-source/free downloader.

The first version uses:

-   yt-dlp;
-   FFmpeg.

Only one download is processed at a time.

The final output is MP3.

Failed downloads must not be reported as successful.

Complex automatic retry strategies are not required.

------------------------------------------------------------------------

## 24. Security

MusicSync must:

1.  verify Telegram User IDs for protected operations;
2.  reject unauthorized Telegram users;
3.  keep bot/API secrets out of source control;
4.  avoid exposing secrets in logs;
5.  validate user-provided YouTube URLs;
6.  allow the Windows client to download only stored, validated YouTube
    URLs;
7.  restrict filesystem operations to the managed folder;
8.  use HTTPS for backend communication.

------------------------------------------------------------------------

## 25. Configuration

Configuration must support:

-   Telegram bot token;
-   authorized Telegram User IDs;
-   backend connection information;
-   Windows USB path;
-   managed USB folder.

Secrets must not be committed to the repository.

An example configuration file must contain no real credentials.

------------------------------------------------------------------------

## 26. Cost and License

The project must operate with a zero euro budget using free services
where appropriate.

MusicSync is open source.

The intended license is MIT.

------------------------------------------------------------------------

## 27. Testing

Automated tests are required.

They must cover at least:

-   normalization;
-   duplicate detection;
-   Song identity;
-   YouTube URL validation;
-   search ranking;
-   database operations;
-   Telegram authorization;
-   synchronization decisions;
-   USB file discovery;
-   filename parsing;
-   state transitions;
-   error handling.

Normal tests must not depend on live Telegram or YouTube services.

------------------------------------------------------------------------

## 28. Maintainability

The implementation should favor:

-   small classes;
-   clear responsibilities;
-   explicit dependencies;
-   simple data flow;
-   minimal global state;
-   dependency injection where useful;
-   interfaces only at meaningful substitution points.

SOLID principles should be applied without unnecessary abstraction.

------------------------------------------------------------------------

## 29. Future Extensibility

The architecture should remain open to:

-   a future web interface;
-   Linux/macOS clients;
-   alternative search providers;
-   alternative download providers;
-   alternative storage implementations.

These are future possibilities, not first-version requirements.

------------------------------------------------------------------------

## 30. Explicitly Excluded Complexity

The first version does not introduce:

-   GUI;
-   automatic synchronization;
-   Windows service;
-   background daemon;
-   polling loop;
-   multiple user roles;
-   complex authentication systems;
-   microservices;
-   Redis;
-   message brokers;
-   WebSockets;
-   event sourcing;
-   CQRS;
-   AI runtime components.

------------------------------------------------------------------------

## 31. First-Version Definition of Done

The first version is complete when an authorized Telegram user can:

1.  search for a Song;
2.  select a result;
3.  confirm it;
4.  add it to the online library;
5.  remove Songs;
6.  list the library;
7.  provide a direct YouTube URL;
8.  have that URL validated before processing;
9.  explicitly bypass duplicate detection with `/force`;
10. manually launch the Windows client;
11. synchronize the online library with the USB;
12. import existing/manual USB music when possible;
13. download missing Songs as MP3;
14. remove obsolete managed Tracks;
15. safely handle unavailable backend/USB;
16. recover from interrupted downloads;
17. never modify files outside the managed folder.

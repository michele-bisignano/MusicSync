# MusicSync --- Database Specification

## 1. Purpose

The database stores the persistent information required to manage
MusicSync's desired music library and coordinate synchronization.

The database is **not** a complete representation of the USB filesystem.

The USB is scanned by the sync client during synchronization.

The database stores:

-   logical Songs;
-   managed Track-to-Song associations;
-   global synchronization metadata.

The first version contains exactly three tables:

``` text
songs
tracks
sync_state
```

There are deliberately no:

``` text
users
sources
sync_clients
```

tables.

------------------------------------------------------------------------

## 2. Design Principles

The database should remain small.

It should represent stable application state rather than continuously
mirror physical USB state.

In particular:

-   a Song may exist without a known YouTube URL;
-   a Track represents a managed physical association, not a live
    filesystem status;
-   the database must not contain a `missing` Track state;
-   synchronization state is global in the first version;
-   soft removal is used for Songs so existing Track paths remain
    available during reconciliation.

------------------------------------------------------------------------

## 3. `songs`

A Song represents a logical music item in the desired library.

### 3.1 Schema

``` sql
CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    artist TEXT NOT NULL,
    title TEXT NOT NULL,

    normalized_artist TEXT NOT NULL,
    normalized_title TEXT NOT NULL,

    version_type TEXT NOT NULL DEFAULT 'standard'
        CHECK (version_type IN (
            'standard',
            'cover',
            'remix',
            'acoustic',
            'live'
        )),

    youtube_url TEXT,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'removed')),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        normalized_artist,
        normalized_title,
        version_type
    )
);
```

### 3.2 YouTube URL may be NULL

This is intentional.

A Song imported from an existing USB file may be known as:

``` text
Artist: Pink Floyd
Title: Time
Version: standard
```

while the YouTube source is unknown.

In that case:

``` text
youtube_url = NULL
```

is valid.

MusicSync must not search YouTube merely to fill this field during
import.

The URL can be added later when the Song needs a downloadable source.

### 3.3 Exact URL uniqueness

The same YouTube URL should normally not represent two different Song
records.

SQLite's normal `UNIQUE` behavior allows multiple `NULL` values, which
is desirable here.

To enforce uniqueness for non-null URLs, the schema should also use:

``` sql
CREATE UNIQUE INDEX idx_songs_youtube_url_unique
ON songs(youtube_url)
WHERE youtube_url IS NOT NULL;
```

This prevents the exact same source URL from being persisted twice while
still allowing imported Songs with no URL.

------------------------------------------------------------------------

## 4. Song Identity

The primary logical identity is:

``` text
normalized_artist
+
normalized_title
+
version_type
```

For example:

``` text
The Beatles
Let It Be
standard
```

and:

``` text
The Beatles
Let It Be
acoustic
```

are distinct Songs.

The original display values remain untouched.

Normalization exists for comparison and duplicate detection only.

------------------------------------------------------------------------

## 5. Song Status

Songs use:

``` text
active
removed
```

### `active`

The Song belongs to the desired library.

### `removed`

The Song no longer belongs to the desired library, but its persistent
record remains temporarily available for synchronization/reconciliation.

A removed Song must not appear in normal `/list` results.

The record should not be hard-deleted automatically while an associated
managed Track may still exist.

Hard deletion, if ever introduced, is a separate maintenance concern.

------------------------------------------------------------------------

## 6. `tracks`

A Track represents a physical MP3 path managed by MusicSync.

### 6.1 Schema

``` sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    song_id INTEGER NOT NULL,

    relative_path TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (song_id)
        REFERENCES songs(id)
        ON DELETE RESTRICT
);
```

### 6.2 Why Track exists

The sync client needs to distinguish:

``` text
Music/
└── Artist - Song.mp3
```

that MusicSync already manages from an arbitrary MP3 manually placed on
the USB.

The persistent association is:

``` text
Song
  ↕
relative_path
```

The Track table therefore stores only the information required for this
association.

### 6.3 What Track does NOT store

Track does not contain:

-   absolute Windows path;
-   USB volume name;
-   USB serial number;
-   `missing` state;
-   download status;
-   YouTube URL;
-   source ID;
-   physical checksum;
-   current filesystem existence.

The current filesystem state is discovered by scanning the USB.

------------------------------------------------------------------------

## 7. Track and Song Relationship

The intended relationship is:

``` text
Song
  │
  └── Track
```

In the first version, a Song is normally represented by at most one
managed Track.

If this invariant is adopted, it should be enforced with:

``` sql
CREATE UNIQUE INDEX idx_tracks_song_unique
ON tracks(song_id);
```

This keeps the physical representation simple:

``` text
one Song
    ↕
one managed MP3
```

If future requirements introduce multiple physical copies, that
constraint can be removed in a deliberate schema migration.

------------------------------------------------------------------------

## 8. `sync_state`

The first version assumes one active synchronization client.

Therefore synchronization state is a singleton.

### 8.1 Schema

``` sql
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    sync_version INTEGER NOT NULL DEFAULT 0
        CHECK (sync_version >= 0),

    last_sync_started_at TEXT,

    last_sync_completed_at TEXT,

    last_sync_status TEXT
        CHECK (
            last_sync_status IS NULL
            OR last_sync_status IN ('success', 'failed')
        )
);
```

The initial migration inserts:

``` sql
INSERT INTO sync_state (
    id,
    sync_version,
    last_sync_started_at,
    last_sync_completed_at,
    last_sync_status
)
VALUES (
    1,
    0,
    NULL,
    NULL,
    NULL
);
```

### 8.2 Meaning

`sync_version` is the version of the desired library.

Every desired-library mutation increments it.

Example:

``` text
0
 ↓ add
1
 ↓ add
2
 ↓ remove
3
```

`last_sync_started_at`, `last_sync_completed_at` and `last_sync_status`
are operational metadata.

They do not replace the version number.

------------------------------------------------------------------------

## 9. Why There Is No `client_id`

The first release assumes:

``` text
one active sync client
```

The system does not need:

``` text
client_id
```

in the database.

If multiple independent clients become a real requirement later, that
can be introduced with an explicit schema and synchronization design.

It is not needed now.

------------------------------------------------------------------------

## 10. Why There Is No `missing` Track State

The database must not try to continuously mirror the USB.

Suppose:

``` text
Track:
Music/Queen - Radio Ga Ga.mp3
```

The file is manually deleted from the USB.

The database does not immediately become:

``` text
status = missing
```

Instead, the next synchronization scans the USB and discovers:

``` text
physical file absent
```

The planner then decides what to do.

This avoids stale physical state in the database.

------------------------------------------------------------------------

## 11. Existing USB Music

An existing USB track can be imported into a database that is:

-   empty;
-   partially populated;
-   already populated.

Example:

``` text
USB:
Music/
└── Queen - Don't Stop Me Now.mp3
```

The client may create:

``` text
songs:
artist = Queen
title = Don't Stop Me Now
youtube_url = NULL
status = active
```

and:

``` text
tracks:
song_id = ...
relative_path = Music/Queen - Don't Stop Me Now.mp3
```

No YouTube search is required.

------------------------------------------------------------------------

## 12. Import Does Not Require a URL

This is an explicit invariant:

``` text
USB import
    ≠
YouTube discovery
```

The client should not waste API requests trying to discover a YouTube
URL for every existing MP3.

A later operation may populate the URL if the Song needs to be
downloaded or otherwise linked to a source.

------------------------------------------------------------------------

## 13. Removed Songs and Tracks

Suppose:

``` text
songs:
id = 10
status = removed
```

and:

``` text
tracks:
song_id = 10
relative_path = Music/Artist - Song.mp3
```

The Track remains until the synchronization process safely removes the
physical file.

After successful physical reconciliation, the Track may be deleted.

The Song may remain as historical/soft-deleted metadata.

This prevents the backend from losing the path needed to clean the USB.

------------------------------------------------------------------------

## 14. Database Constraints

The database should enforce stable invariants:

``` text
songs logical identity UNIQUE

non-null songs.youtube_url UNIQUE

tracks.relative_path UNIQUE

tracks.song_id → songs.id

sync_state.id = 1
```

Potential additional invariant:

``` text
tracks.song_id UNIQUE
```

if the first version guarantees one managed physical track per Song.

------------------------------------------------------------------------

## 15. Indexes

Recommended indexes:

``` sql
CREATE INDEX idx_tracks_song_id
ON tracks(song_id);
```

The unique indexes described above also provide lookup support.

Depending on query patterns, additional indexes can be introduced later
rather than speculatively.

------------------------------------------------------------------------

## 16. Initial Migration

The first migration should be:

``` text
backend/migrations/0001_initial.sql
```

Conceptually:

``` sql
PRAGMA foreign_keys = ON;

CREATE TABLE songs (
    ...
);

CREATE UNIQUE INDEX idx_songs_youtube_url_unique
ON songs(youtube_url)
WHERE youtube_url IS NOT NULL;

CREATE TABLE tracks (
    ...
);

CREATE INDEX idx_tracks_song_id
ON tracks(song_id);

CREATE UNIQUE INDEX idx_tracks_song_unique
ON tracks(song_id);

CREATE TABLE sync_state (
    ...
);

INSERT INTO sync_state (...);
```

The exact migration should be treated as the authoritative executable
schema.

------------------------------------------------------------------------

## 17. Timestamps

Timestamps are stored as text in a consistent machine-readable format.

The application should generate timestamps consistently, preferably
using UTC.

The database should not depend on local Windows timezone behavior.

------------------------------------------------------------------------

## 18. Transactions

Operations that mutate desired library state and `sync_version` must be
transactional.

For example:

``` text
BEGIN
    update Song
    increment sync_version
COMMIT
```

If the transaction fails:

``` text
ROLLBACK
```

The database must not contain a Song mutation without the corresponding
version update.

The same principle applies to removal.

------------------------------------------------------------------------

## 19. Import Transactions

A successful USB import may require:

``` text
create/update Song
create Track
increment sync_version
```

These database mutations should be performed transactionally.

If the import cannot be persisted, the physical file must not be treated
as successfully imported.

The file remains on the USB.

------------------------------------------------------------------------

## 20. Database and Physical State

The database does not guarantee that:

``` text
Track row exists
```

means:

``` text
file currently exists
```

That fact is intentionally determined by the sync client.

The database describes managed relationships and desired state.

The USB scan describes physical reality.

------------------------------------------------------------------------

## 21. No User Table

Telegram authorization is configuration:

``` text
AUTHORIZED_TELEGRAM_IDS
```

There is no:

``` text
users
```

table.

This avoids creating an unnecessary account system.

If a future web interface needs accounts, authentication can be
introduced as a separate future feature.

------------------------------------------------------------------------

## 22. No Source Table

The first version stores:

``` text
youtube_url
```

directly on Song.

There is no:

``` text
sources
source_id
SourceRepository
```

This is intentional.

If future requirements require multiple simultaneous sources per Song,
that change should be introduced deliberately rather than anticipated
through unnecessary tables now.

------------------------------------------------------------------------

## 23. Migration Strategy

Schema changes must be performed through numbered migrations.

Example:

``` text
0001_initial.sql
0002_add_x.sql
0003_change_y.sql
```

Existing data must be preserved whenever practical.

Migrations should be small and independently understandable.

------------------------------------------------------------------------

## 24. Development Data

Development/test data may include:

-   Songs with URLs;
-   Songs with `youtube_url = NULL`;
-   active Songs;
-   removed Songs;
-   Tracks;
-   sync versions.

Development data must never contain real secrets.

------------------------------------------------------------------------

## 25. Database Invariants Summary

The first version must maintain these invariants:

1.  every Track references an existing Song;
2.  every Track path is unique;
3.  every non-null YouTube URL is unique;
4.  logical Song identity is unique;
5.  `sync_state` contains exactly one row;
6.  `sync_state.id = 1`;
7.  `sync_version >= 0`;
8.  a Song may have no YouTube URL;
9.  the database does not represent live USB existence;
10. removed Songs remain available long enough to reconcile managed
    Tracks;
11. no user/source/client tables are required.

------------------------------------------------------------------------

## 26. Relationship to Other Documents

This document defines the persistence model.

It does not define:

-   Telegram command behavior;
-   HTTP endpoint details;
-   search ranking algorithms;
-   filesystem implementation;
-   project source layout.

Those belong respectively to:

``` text
REQUIREMENTS.md
ARCHITECTURE.md
API.md
PROJECT_STRUCTURE.md
```

-- MusicSync D1 Database Initial Schema
-- Enforces: Foreign keys, ISO 8601 timestamps, uniqueness constraints, and atomic versioning.

PRAGMA foreign_keys = ON;

-- 1. Songs Table
CREATE TABLE IF NOT EXISTS songs (
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

-- Non-null YouTube URL must be unique across all songs
CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_youtube_url_unique
ON songs(youtube_url)
WHERE youtube_url IS NOT NULL;

-- Fast lookup for active songs in /list and synchronization
CREATE INDEX IF NOT EXISTS idx_songs_status
ON songs(status);

-- 2. Tracks Table
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    song_id INTEGER NOT NULL,

    relative_path TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (song_id)
        REFERENCES songs(id)
        ON DELETE RESTRICT
);

-- Exactly one managed physical track per song in version 1
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_song_unique
ON tracks(song_id);

-- 3. Sync State Table (Singleton id = 1)
CREATE TABLE IF NOT EXISTS sync_state (
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

-- Initialize singleton sync_state row
INSERT OR IGNORE INTO sync_state (
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

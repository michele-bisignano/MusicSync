# MusicSync --- API Specification

## 1. Purpose

The MusicSync API is the boundary between the online backend and
synchronization clients.

The API is intentionally small.

The first version does not expose the complete backend or database.

Current endpoints:

``` text
GET  /api/v1/health
GET  /api/v1/sync/state
POST /api/v1/sync/report
```

Telegram uses a separate webhook endpoint:

``` text
POST /telegram/webhook
```

There is no synchronization `/start` endpoint.

Synchronization starts when the local client is manually launched.

------------------------------------------------------------------------

## 2. Network Transport

The API is an HTTP/REST API conceptually.

Production communication must use:

``` text
HTTPS
```

This applies to:

``` text
Telegram → Backend
Sync Client → Backend
```

Plain HTTP may be used only for controlled local development where
appropriate.

The API must never require plaintext HTTP in production.

------------------------------------------------------------------------

## 3. Authentication and Authorization

### 3.1 Telegram

Telegram supplies the sender's numeric User ID.

MusicSync checks:

``` text
AUTHORIZED_TELEGRAM_IDS
```

Additionally, Cloudflare Worker validates the Telegram Webhook secret
token header (`X-Telegram-Bot-Api-Secret-Token`).

There is no MusicSync login system.

Unauthorized Telegram users are ignored silently without leaking any
information.

### 3.2 Sync Client

The sync API endpoints are secured using a static pre-shared key
(`SYNC_TOKEN`).

The client must supply this token on all `/api/v1/*` requests (except
`/health`) using the standard HTTP header:

``` text
Authorization: Bearer <SYNC_TOKEN>
```

If the token is missing or invalid, the backend responds immediately
with `401 Unauthorized`.

This eliminates public exposure on Cloudflare Workers without requiring
user accounts, passwords, or session storage.

------------------------------------------------------------------------

## 4. Telegram Webhook

Endpoint:

``` text
POST /telegram/webhook
```

Telegram sends updates to the backend.

Conceptual flow:

``` text
Telegram
   ↓
POST /telegram/webhook
   ↓
parse update
   ↓
read Telegram User ID
   ↓
authorization check
   ↓
ignore unauthorized update
   ↓
command handler
```

The webhook endpoint must not expose internal errors or secrets to
Telegram users.

------------------------------------------------------------------------

## 5. GET /api/v1/sync/state

### 5.1 Purpose

Returns a complete desired-state snapshot for the sync client.

The response is denormalized at the API boundary specifically to make
client synchronization planning straightforward and deterministic, while
the database remains cleanly normalized internally.

The response is associated with a specific:

``` text
sync_version
```

### 5.2 JSON Response Schema

``` json
{
  "sync_version": 42,
  "desired_tracks": [
    {
      "song_id": 1,
      "artist": "Daft Punk",
      "title": "Get Lucky",
      "version_type": "standard",
      "youtube_url": "https://www.youtube.com/watch?v=...",
      "relative_path": "Daft Punk - Get Lucky.mp3"
    },
    {
      "song_id": 2,
      "artist": "Queen",
      "title": "Don't Stop Me Now",
      "version_type": "standard",
      "youtube_url": null,
      "relative_path": "Queen - Don't Stop Me Now.mp3"
    }
  ],
  "obsolete_tracks": [
    {
      "song_id": 7,
      "artist": "The Beatles",
      "title": "Yesterday",
      "relative_path": "The Beatles - Yesterday.mp3"
    }
  ]
}
```

Path Rule:
`relative_path` is always strictly relative to the client's configured
`MANAGED_FOLDER`. It must never be prefixed with `"Music/"` or any
folder name.

### 5.3 Obsolete and Removed Tracks

The `obsolete_tracks` list contains all managed tracks whose corresponding
Song has `status = 'removed'`.

The sync client uses `obsolete_tracks` to locate and safely delete
managed files from the USB that the user has chosen to remove. This
removes the need for the client to cross-reference multiple relational
arrays.

------------------------------------------------------------------------

## 6. Snapshot Semantics

The response from `/sync/state` represents one coherent desired-state
snapshot.

The client records:

``` text
sync_version
```

before planning or executing synchronization.

The backend must not construct a response mixing different database
versions.

The Song/Track data and `sync_version` must represent one consistent
snapshot.

------------------------------------------------------------------------

## 7. Song Without YouTube URL

The API may return:

``` json
{
  "youtube_url": null
}
```

This is valid.

It occurs when a Song was imported from the USB without a known YouTube
source.

The sync client must not silently search YouTube merely because the
field is null.

A Song with no URL cannot be downloaded until a valid source is
supplied.

The synchronization planner should report this as an unresolved download
requirement rather than choosing an unrelated source.

------------------------------------------------------------------------

## 8. POST /api/v1/sync/report

### 8.1 Purpose

The client reports the result of a synchronization attempt.

The report is associated with the version that the client synchronized.

Conceptual request:

``` json
{
  "sync_version": 42,
  "status": "success",
  "operations": [
    {
      "type": "download",
      "song_id": 1,
      "relative_path": "Daft Punk - Get Lucky.mp3"
    },
    {
      "type": "delete",
      "song_id": 7,
      "relative_path": "Old Song.mp3"
    },
    {
      "type": "import",
      "song": {
        "artist": "Queen",
        "title": "Don't Stop Me Now",
        "version_type": "standard",
        "youtube_url": null
      },
      "relative_path": "Queen - Don't Stop Me Now.mp3"
    }
  ]
}
```

Path Rule:
`relative_path` across all operations must be strictly relative to the
client's configured `MANAGED_FOLDER`.

### 8.2 Response Schema

Upon processing the report, the backend responds with `200 OK` and a
summary payload containing the new consolidated `sync_version`:

``` json
{
  "acknowledged": true,
  "sync_version": 43,
  "summary": {
    "tracks_confirmed": 5,
    "tracks_removed": 2,
    "songs_imported": 1
  }
}
```

If the report included new imported tracks, the backend advances
`sync_version` (e.g. from 42 to 43). The client must store this returned
version locally as its new aligned state.

### 8.3 Operation Types

The first version supports:

``` text
download
delete
import
```

A synchronization may also report:

``` text
status = failed
```

when the complete operation did not succeed.

------------------------------------------------------------------------

## 9. Report Version Rules

Suppose:

``` text
client synchronized version 42
backend current version = 43
```

The report for version 42 must not:

-   change version 43 back to 42;
-   claim that version 43 was synchronized;
-   delete newer desired-state information.

The backend may record that version 42 was processed, but the
authoritative desired state remains version 43.

A later synchronization can reconcile version 43.

------------------------------------------------------------------------

## 10. USB Import and Version Changes

An import discovered by the client may create or modify a Song.

Because that changes persistent desired-library state, the backend may
need to increment `sync_version`.

Example:

``` text
client synchronized desired version 42

USB contains:
Artist - New Song.mp3

client reports import

backend:
42 → 43
```

The backend must apply this mutation transactionally.

The import report must not blindly force the database back to the
client's older version.

------------------------------------------------------------------------

## 11. Idempotency

The client may retry a report after a network failure.

The backend should make report processing sufficiently idempotent to
avoid creating duplicate Songs or Tracks.

The exact idempotency strategy can be implemented through:

-   database uniqueness constraints;
-   checking Song identity;
-   checking relative path;
-   operation identifiers if later required.

A full distributed job system is not required.

------------------------------------------------------------------------

## 12. API Errors

All error responses from the API return a uniform JSON error payload:

``` json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of the error",
    "details": {}
  }
}
```

Expected HTTP status codes and standard codes:

### `200 OK`

Request completed successfully.

### `400 Bad Request`

Malformed or invalid request (`INVALID_PAYLOAD`, `MISSING_FIELD`).

### `401 Unauthorized`

Missing or invalid `SYNC_TOKEN` in the `Authorization: Bearer <token>` header (`UNAUTHORIZED`).

### `404 Not Found`

Requested resource or route does not exist (`NOT_FOUND`).

### `409 Conflict`

The requested operation conflicts with current persistent state or version mismatch (`VERSION_CONFLICT`).

### `500 Internal Server Error`

Unexpected backend failure (`INTERNAL_ERROR`).

### `503 Service Unavailable`

Backend dependency is temporarily unavailable (`SERVICE_UNAVAILABLE`).

------------------------------------------------------------------------

## 13. URL Validation

Any endpoint or application flow accepting a YouTube URL must validate
it structurally.

Accepted hosts include at minimum:

``` text
www.youtube.com
youtube.com
youtu.be
```

The implementation must reject lookalike hosts such as:

``` text
youtube.com.evil.example
evil.example/youtube.com/...
```

Validation must happen before metadata retrieval or persistence.

`/force` does not bypass URL validation.

------------------------------------------------------------------------

## 14. API and Filesystem Boundaries

The backend must never receive arbitrary filesystem paths as commands to
execute.

The client determines local paths from:

``` text
USB_PATH
MANAGED_FOLDER
relative_path
```

The backend only communicates logical relative paths that belong to the
managed folder.

The client validates paths before filesystem operations.

------------------------------------------------------------------------

## 15. API and Sync Safety

The client must not perform destructive operations if:

-   `/sync/state` cannot be fetched completely;
-   the response is invalid;
-   the USB is unavailable;
-   the client cannot establish the state snapshot;
-   the application cannot safely determine managed-file ownership.

The API is designed so the client can fail safely.

------------------------------------------------------------------------

## 16. Future Extensions

The API should remain extensible for future:

-   machine authentication;
-   additional sync clients;
-   local backend deployment;
-   Web UI;
-   richer synchronization reporting;
-   synchronization history.

These are not part of the first API contract.

The first API should remain small.

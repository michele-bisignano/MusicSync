# MusicSync --- API Specification

## 1. Purpose

The MusicSync API is the boundary between the online backend and
synchronization clients.

The API is intentionally small.

The first version does not expose the complete backend or database.

Current synchronization endpoints:

``` text
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

There is no MusicSync login system.

Unauthorized Telegram users should be ignored without a useful response.

### 3.2 Sync Client

The first version has:

``` text
no SYNC_CLIENT_SECRET
no SYNC_CLIENT_TOKEN
```

The sync client is not a user-facing account.

The backend API therefore does not require a client password/secret in
the first version.

If machine authentication becomes necessary later, it can be added as a
backward-compatible architectural extension.

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

The response must be sufficient for the client to plan synchronization.

The response is associated with a specific:

``` text
sync_version
```

### 5.2 Conceptual response

``` json
{
  "sync_version": 42,
  "songs": [
    {
      "id": 1,
      "artist": "Daft Punk",
      "title": "Get Lucky",
      "version_type": "standard",
      "youtube_url": "https://www.youtube.com/watch?v=..."
    },
    {
      "id": 2,
      "artist": "Queen",
      "title": "Don't Stop Me Now",
      "version_type": "standard",
      "youtube_url": null
    }
  ],
  "tracks": [
    {
      "song_id": 1,
      "relative_path": "Music/Daft Punk - Get Lucky.mp3"
    },
    {
      "song_id": 2,
      "relative_path": "Music/Queen - Don't Stop Me Now.mp3"
    }
  ]
}
```

This is a conceptual schema. The implementation must define the exact
JSON contract and field validation.

### 5.3 Removed Songs

The client needs enough information to remove obsolete managed Tracks.

Therefore the API response should either:

-   include removed Songs together with their Track associations; or
-   provide an equivalent explicit representation of removed managed
    Tracks.

The client must not be forced to infer removals from an incomplete
response.

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
      "relative_path": "Music/Daft Punk - Get Lucky.mp3"
    },
    {
      "type": "delete",
      "song_id": 7,
      "relative_path": "Music/Old Song.mp3"
    },
    {
      "type": "import",
      "song": {
        "artist": "Queen",
        "title": "Don't Stop Me Now",
        "version_type": "standard",
        "youtube_url": null
      },
      "relative_path": "Music/Queen - Don't Stop Me Now.mp3"
    }
  ]
}
```

The exact schema is finalized during implementation.

### 8.2 Operation Types

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

The first version does not require machine-authentication errors.

Expected responses include:

### `200 OK`

Request completed successfully.

### `400 Bad Request`

Malformed or invalid request.

Examples:

-   invalid JSON;
-   missing required field;
-   invalid operation type;
-   invalid sync version.

### `404 Not Found`

Requested resource or route does not exist.

### `409 Conflict`

The requested operation conflicts with current persistent state.

Examples:

-   impossible Track association;
-   conflicting identity/path;
-   invalid state transition.

### `500 Internal Server Error`

Unexpected backend failure.

### `503 Service Unavailable`

Backend dependency is temporarily unavailable.

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

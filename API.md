# API

## 1. Scope

The API is the communication layer between the online backend and the
Windows sync client.

The backend is the source of truth for the desired music library.

The Windows client reads the desired state, compares it with the USB
contents, performs the required changes, and reports the result.

Telegram commands are handled internally by the backend through the
Telegram Bot API. They are not exposed as public MusicSync API
endpoints.

The API is intentionally small.

------------------------------------------------------------------------

## 2. Authorization

MusicSync does not use user accounts or client authentication.

Telegram is the only user-facing entry point.

Protected Telegram operations are authorized by checking the numeric
Telegram User ID against the configured `AUTHORIZED_TELEGRAM_IDS` list.

The Windows client does not authenticate as a user. It only synchronizes
the desired library exposed by the backend.

The synchronization API must only expose operations required by the
Windows client.

------------------------------------------------------------------------

## 3. Sync API

The initial API exposes only the endpoints required for synchronization.

### 3.1 GET `/api/v1/sync/state`

Returns the current desired library and synchronization version.

Example:

``` json
{
  "sync_version": 12,
  "songs": [
    {
      "id": 1,
      "artist": "Artist Name",
      "title": "Song Title",
      "version_type": "standard",
      "youtube_url": "https://www.youtube.com/watch?v=..."
    }
  ]
}
```

Only active Songs are returned.

The API does not return the physical USB state.

The response must contain enough information for the client to
determine:

-   which Songs should exist on the USB;
-   which YouTube URL should be downloaded;
-   the logical identity of each Song.

------------------------------------------------------------------------

### 3.2 POST `/api/v1/sync/report`

Reports the result of a synchronization operation.

Example:

``` json
{
  "sync_version": 12,
  "status": "success",
  "operations": [
    {
      "type": "download",
      "song_id": 1,
      "relative_path": "Artist Name - Song Title.mp3"
    },
    {
      "type": "delete",
      "song_id": 2,
      "relative_path": "Old Artist - Old Song.mp3"
    },
    {
      "type": "import",
      "song_id": 3,
      "relative_path": "Other Artist - Other Song.mp3"
    }
  ]
}
```

Possible operation types:

-   `download` --- a desired Song was successfully downloaded.
-   `delete` --- a previously managed Track was removed.
-   `import` --- a USB file was successfully associated with a Song.

Only completed operations may be reported as successful.

A failed download or incomplete operation must not be reported as
successful.

------------------------------------------------------------------------

## 4. Sync Version

`sync_version` identifies a specific version of the desired library.

The backend increments it whenever the desired library changes.

Example:

``` text
version 10
    ↓
Telegram adds a Song
    ↓
version 11
```

The client reports the version it synchronized.

If the library changes during synchronization:

``` text
Client fetches version 12
        ↓
User adds a Song through Telegram
        ↓
Backend becomes version 13
        ↓
Client reports version 12
```

The backend must not treat this as synchronization of version 13.

The newer desired state remains authoritative and will be synchronized
on a later client run.

------------------------------------------------------------------------

## 5. YouTube URL Validation

Direct YouTube URLs are validated by the backend before they can be
processed or stored.

Validation must verify that the URL belongs to a supported YouTube
domain and uses a supported YouTube URL format.

At minimum, the first version should support:

``` text
https://www.youtube.com/watch?v=...
https://youtube.com/watch?v=...
https://youtu.be/...
```

Lookalike or unrelated domains must be rejected.

For example:

``` text
https://youtube.com.evil.example/...
https://evil.example/youtube.com/...
```

must not be accepted.

Validation happens before metadata retrieval and before persistence.

The exact URL supplied by the user is preserved after confirmation.

`/force` does not bypass URL validation.

------------------------------------------------------------------------

## 6. Direct YouTube URL Flow

The flow is:

``` text
User provides URL
       ↓
Validate YouTube URL
       ↓
Retrieve metadata
       ↓
Normalize metadata
       ↓
Duplicate check
       ↓
Ask for confirmation
       ↓
Save exact supplied URL
```

If validation fails, the URL is rejected.

If the source is unavailable or unsuitable, the user is informed.

The system must never silently replace the supplied URL with another
upload.

------------------------------------------------------------------------

## 7. Telegram ↔ Backend

Telegram is the user interface for library management.

The backend handles:

-   Telegram authorization;
-   search;
-   search result selection;
-   direct YouTube URLs;
-   duplicate detection;
-   add;
-   remove;
-   list;
-   force-add.

The backend stores the desired library directly in the database.

A Telegram operation that changes the desired library increments
`sync_version`.

------------------------------------------------------------------------

## 8. Error Handling

The API uses JSON for request and response bodies.

Relevant HTTP status codes include:

-   `200 OK` --- successful request.
-   `400 Bad Request` --- invalid request.
-   `404 Not Found` --- requested resource does not exist.
-   `409 Conflict` --- synchronization state conflict.
-   `500 Internal Server Error` --- unexpected backend error.
-   `503 Service Unavailable` --- backend temporarily unavailable.

Example:

``` json
{
  "error": "invalid_request",
  "message": "The synchronization report is invalid."
}
```

Clients should not depend on the exact error message text.

------------------------------------------------------------------------

## 9. Failure Safety

If the backend is unavailable, the Windows client must not perform
destructive synchronization based on stale or incomplete desired state.

If the USB is unavailable, no filesystem operation is performed.

If a report cannot be sent after physical operations completed, the next
synchronization must reconcile the actual USB contents with the current
desired state.

Incomplete downloads must not count as completed Tracks.

------------------------------------------------------------------------

## 10. Security Rules

-   All network communication uses HTTPS.
-   Telegram authorization is based on numeric Telegram User IDs.
-   Only configured Telegram User IDs may modify the library.
-   YouTube URLs must pass backend validation before processing or
    persistence.
-   The Windows client must never download an arbitrary URL supplied
    directly by a user.
-   Only YouTube URLs stored in the backend database may be used as
    download sources.
-   Filesystem operations remain restricted to the configured managed
    folder.
-   Secrets such as the Telegram bot token and YouTube API key are never
    committed to source control.
-   The backend never accesses the physical USB filesystem.

------------------------------------------------------------------------

## 11. Design Constraints

The API intentionally does not provide:

-   a generic CRUD API for Songs;
-   a users API;
-   a sources API;
-   a tracks API;
-   WebSockets;
-   background synchronization;
-   queues;
-   a complex authentication system.

The API exists only to connect the online desired state with the
manually executed Windows synchronization client.

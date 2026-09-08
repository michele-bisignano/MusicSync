# MusicSync — Architecture Specification

## 1. Purpose

This document defines the high-level architecture of MusicSync.

It describes:

- the main system components;
- their responsibilities;
- the boundaries between components;
- how components communicate;
- the desired-state synchronization model;
- the main architectural decisions and constraints.

This document does not define:

- functional requirements;
- database schema;
- API contracts;
- concrete classes and interfaces;
- source-code file structure.

Those aspects are defined in the other project documents.

---

# 2. System Architecture

MusicSync consists of two independent applications:

1. **Online Backend**
2. **Windows Sync Client**

The backend is continuously available online and manages the desired music library.

The Windows client is manually launched by the user and synchronizes the desired library with the physical USB drive.

```text
                         INTERNET
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
       ┌───────────┐               ┌──────────────┐
       │ Telegram  │               │  YouTube     │
       │   Bot     │               │  Data API    │
       └─────┬─────┘               └──────┬───────┘
             │                            │
             │ HTTPS                      │ HTTPS
             ▼                            │
       ┌────────────────────────────────────────┐
       │             ONLINE BACKEND             │
       │                                        │
       │ Telegram interface                     │
       │ Search                                 │
       │ Library management                     │
       │ Synchronization API                    │
       │                                        │
       │              Cloudflare Worker         │
       │                     │                  │
       │                     ▼                  │
       │                Cloudflare D1            │
       └─────────────────────┬──────────────────┘
                             │
                            HTTPS
                             │
                             ▼
                    ┌──────────────────┐
                    │ Windows Client   │
                    │                  │
                    │ Sync             │
                    │ USB filesystem   │
                    │ Download         │
                    └────────┬─────────┘
                             │
                             ▼
                       ┌───────────┐
                       │ USB Drive │
                       └───────────┘
```

The backend never accesses the USB filesystem.

The Windows client never accesses the database directly.

The two components communicate through the synchronization API.

---

# 3. Online Backend

The backend is the online part of MusicSync.

Its main responsibilities are:

- receiving Telegram interactions;
- authorizing Telegram users;
- searching YouTube;
- validating YouTube URLs;
- managing the desired music library;
- persisting library state;
- exposing the synchronization API.

The backend runs as a single Cloudflare Worker.

It does not require a home server or continuously running local machine.

---

# 4. Windows Sync Client

The Windows client is the local part of MusicSync.

Its responsibilities are:

- accessing the configured USB drive;
- determining the physical USB state;
- reconciling physical state with desired state;
- importing USB-originated music;
- downloading missing tracks;
- removing obsolete managed tracks;
- reporting synchronization results.

The client is manually launched by the user.

It is not a background service and does not need to remain running.

---

# 5. Technology Choices

## 5.1 Backend

The backend uses:

```text
Cloudflare Workers
TypeScript
Cloudflare D1
```

The Worker contains the application logic and accesses D1 through its binding.

---

## 5.2 Telegram

Telegram communication uses the Telegram Bot API.

Telegram updates are received through a webhook.

```text
Telegram
    │
    │ HTTPS
    ▼
Cloudflare Worker
```

Telegram is the user-facing interface of the first version.

---

## 5.3 YouTube

The backend uses the YouTube Data API for search and metadata retrieval.

The YouTube API key is a backend secret and is never exposed to the user or Windows client.

---

## 5.4 Windows Client

The Windows client uses Python.

Audio downloading and conversion are performed locally using:

```text
yt-dlp
FFmpeg
```

The backend never downloads audio.

---

# 6. Desired State and Physical State

MusicSync deliberately separates two states.

### Desired state

The online database represents what the music library **should contain**.

### Physical state

The USB represents what physically exists on the drive.

```text
          DESIRED STATE
        Online Database
               │
               │
               ▼
       Windows Sync Client
               │
               │ reconciliation
               ▼
          PHYSICAL STATE
             USB
```

The Windows client is responsible for reconciling these states.

The database is not intended to continuously mirror the filesystem.

---

# 7. Synchronization Model

Synchronization is a reconciliation process rather than a continuous replication system.

The client:

1. retrieves the desired state;
2. scans the managed USB folder;
3. determines the physical state;
4. compares the two states;
5. creates a synchronization plan;
6. executes the plan;
7. reports the result.

Conceptually:

```text
Desired State
      +
Physical State
      │
      ▼
Sync Planner
      │
      ▼
Sync Plan
      │
      ▼
Sync Executor
      │
      ▼
Updated USB
      │
      ▼
Report
```

The planning phase should be separated from filesystem modification so that synchronization decisions can be tested independently.

---

# 8. Synchronization Authority

The backend is authoritative for the **desired library**.

The USB is authoritative for the **physical filesystem state** at the moment it is scanned.

The Windows client does not independently decide that a Song should belong to the online library simply because it exists locally.

USB-originated files are instead identified and explicitly reconciled with the backend.

This distinction prevents the client from silently changing the desired library during ordinary synchronization.

---

# 9. Synchronization Versioning

The backend maintains a monotonically increasing synchronization version.

A library change produces a new version of the desired state.

```text
Version 10
    │
    │ library change
    ▼
Version 11
```

The Windows client synchronizes a specific version of the desired state.

If the online library changes while synchronization is running, the client must not claim to have synchronized the newer state.

Example:

```text
Client fetches version 42
          │
          ▼
User changes library
          │
          ▼
Backend becomes version 43
          │
          ▼
Client finishes version 42
```

The client reports version 42.

A later synchronization can reconcile version 43.

---

# 10. Telegram Authorization

Telegram is the only user-facing authorization mechanism.

The Telegram layer checks the sender's numeric Telegram User ID against the configured list of authorized IDs.

```text
Telegram User ID
       │
       ▼
Telegram Authorization
       │
   ┌───┴───┐
   │       │
 allowed  rejected
   │
   ▼
command processing
```

There is:

- no MusicSync user account system;
- no `users` table;
- no username-based authorization;
- no role hierarchy.

Authorization applies to Telegram operations such as adding, removing, listing and force-adding songs.

The Windows synchronization client does not represent a separate MusicSync user.

---

# 11. Telegram Application Boundary

Telegram is treated as an interface layer.

The internal application logic must not depend on Telegram command names.

Conceptually:

```text
Telegram Update
      │
      ▼
Telegram Interface
      │
      ▼
Application Logic
      │
      ▼
Domain / Persistence
```

The Telegram layer is responsible for:

- parsing updates;
- authorization;
- command handling;
- confirmation interactions;
- formatting responses.

It must not contain database or synchronization logic.

---

# 12. YouTube URL Validation

User-provided URLs are untrusted input.

YouTube URL validation is therefore performed by the backend before metadata retrieval or persistence.

```text
User URL
   │
   ▼
YouTube URL Validator
   │
   ├── invalid ──► reject
   │
   └── valid
        │
        ▼
YouTube Metadata Provider
```

The validator is responsible only for determining whether the URL belongs to a supported YouTube URL format.

It must validate the actual hostname rather than merely searching for the string `youtube.com`.

The exact supplied URL is preserved after successful validation.

This validation is separate from Telegram authorization:

```text
Telegram authorization
    → "Is this user allowed to use MusicSync?"

YouTube URL validation
    → "Is this input actually a supported YouTube URL?"
```

---

# 13. Search Architecture

Search is divided into external candidate retrieval and local interpretation.

```text
User query
    │
    ▼
YouTube Search Provider
    │
    ▼
Candidate results
    │
    ▼
Normalization
    │
    ▼
Local Ranking
    │
    ▼
Candidates shown to user
```

The external provider is responsible for retrieving candidates.

The local search logic is responsible for:

- normalization;
- relevance evaluation;
- version interpretation;
- ranking;
- filtering unsuitable candidates.

Search and ranking do not directly modify the library.

A Song enters the library only after the user confirms the selected result.

---

# 14. Domain Boundary

The core domain represents logical music concepts independently from external services.

The central relationship is:

```text
Song
  │
  └── Track
```

A `Song` represents a logical item in the desired library.

A `Track` represents its physical manifestation on the USB.

The domain must not depend directly on:

- Telegram;
- YouTube;
- Cloudflare;
- D1;
- yt-dlp;
- FFmpeg;
- Windows filesystem APIs.

External dependencies enter the system through dedicated integration boundaries.

---

# 15. Persistence Boundary

Database access is isolated from application and domain logic.

Conceptually:

```text
Application Logic
       │
       ▼
Repository / Persistence Boundary
       │
       ▼
Cloudflare D1
```

Application logic must not contain raw SQL.

The exact tables, columns, constraints and queries are defined in `DATABASE.md`.

The concrete repository classes and interfaces are defined in `PROJECT_STRUCTURE.md`.

---

# 16. Filesystem Boundary

The Windows filesystem is isolated behind the local USB layer.

```text
Sync Logic
     │
     ▼
Filesystem Boundary
     │
     ▼
USB Drive
```

The synchronization logic should not directly manipulate arbitrary filesystem paths.

All filesystem operations must remain within the configured managed folder.

Files outside that folder are outside MusicSync's responsibility.

---

# 17. Download Boundary

Downloading is isolated from synchronization planning and database persistence.

```text
Sync Executor
     │
     ▼
Downloader
     │
     ├── yt-dlp
     └── FFmpeg
```

The downloader is responsible for turning an approved YouTube source into a completed MP3.

It does not decide:

- which Song should be downloaded;
- whether a Song belongs to the library;
- whether a file should be deleted.

Those decisions belong to higher-level synchronization logic.

---

# 18. Download Safety

The Windows client must never download an arbitrary URL supplied directly by a user.

The client may download only a YouTube URL that has already been:

1. validated by the backend;
2. included in the desired synchronization state.

This creates a deliberate security boundary:

```text
User input
    │
    ▼
Backend validation
    │
    ▼
Desired state
    │
    ▼
Windows client
    │
    ▼
Downloader
```

Telegram input therefore never becomes a direct command to the local downloader.

---

# 19. Safe Synchronization

Synchronization must fail safely whenever the client cannot establish a trustworthy state.

Examples:

### Backend unavailable

```text
Backend unavailable
       │
       ▼
No reliable desired state
       │
       ▼
No destructive synchronization
```

### USB unavailable

```text
USB unavailable
       │
       ▼
No filesystem synchronization
```

### Interrupted download

```text
Incomplete download
       │
       ▼
Must not appear as completed Track
```

The general principle is:

> When synchronization cannot be performed safely, leave the existing data untouched and report the failure.

---

# 20. USB Import

The client may discover MP3 files that were not previously known to MusicSync.

These files can be identified and reported to the backend.

```text
USB-only file
      │
      ▼
Identification
      │
      ▼
Backend report
```

The physical file remains on the USB.

Import is therefore a controlled mechanism for reconciling USB-originated changes with the online desired library.

---

# 21. Backend Changes During Synchronization

The backend and Windows client operate independently.

Telegram can modify the desired library while the Windows client is synchronizing.

The synchronization protocol therefore uses versioning rather than assuming that the desired state remains unchanged for the entire operation.

The client must never overwrite a newer backend state with information derived from an older synchronization snapshot.

---

# 22. Concurrency Model

The first version assumes a single active Windows synchronization client.

Multiple authorized Telegram users may modify the online library.

The backend must preserve consistency of library changes.

A complex distributed locking mechanism is not required.

Synchronization versioning is sufficient for the first version.

---

# 23. Configuration Boundary

Configuration is external to application logic.

The backend requires configuration for:

```text
TELEGRAM_BOT_TOKEN
AUTHORIZED_TELEGRAM_IDS
YOUTUBE_API_KEY
```

The Windows client requires configuration for:

```text
BACKEND_URL
USB_PATH
MANAGED_FOLDER
```

Secrets must not be stored in source control.

The USB volume label is irrelevant; synchronization uses the configured filesystem path.

---

# 24. Testing Architecture

Important components should be testable independently from their external dependencies.

Examples:

```text
Search
  └── Fake search provider

Persistence
  └── Test repository / database

Synchronization
  └── In-memory desired and physical states

Download
  └── Fake downloader

Filesystem
  └── Temporary test directory
```

The synchronization planner should be testable without a real USB drive.

External services such as Telegram and YouTube should not be required for normal automated tests.

The concrete test organization is defined in `PROJECT_STRUCTURE.md`.

---

# 25. Dependency Direction

Dependencies should flow from external infrastructure toward the application and domain rather than the opposite.

```text
External Services
       │
       ▼
Integration / Adapters
       │
       ▼
Application Logic
       │
       ▼
Domain
```

The domain must remain independent of infrastructure.

Application logic should depend on abstractions where a meaningful substitution boundary exists.

---

# 26. Interfaces and Abstractions

Interfaces are used only where they represent meaningful architectural boundaries.

Good candidates are components that interact with:

- external services;
- persistence;
- filesystem;
- downloading;
- backend communication.

An interface should not be introduced merely because a class exists.

The purpose of an interface is to:

- isolate an external dependency;
- make substitution possible;
- improve testability;
- preserve a meaningful architectural boundary.

Concrete classes, interfaces and their relationships are defined in `PROJECT_STRUCTURE.md`.

---

# 27. Maintainability Principles

The implementation should favor:

- small classes;
- single clear responsibilities;
- explicit dependencies;
- composition over unnecessary inheritance;
- minimal global state;
- simple data flow;
- dependency injection where useful;
- abstractions only where justified.

SOLID principles should guide the design without becoming a reason for unnecessary complexity.

---

# 28. Extensibility

The architecture should leave room for future additions without implementing them prematurely.

Possible future extensions include:

```text
Telegram
    │
    └── Web UI
```

```text
Windows Client
Linux Client
macOS Client
```

```text
Current Search Provider
Future Search Provider
```

```text
Current Downloader
Future Downloader
```

These possibilities should be supported through meaningful boundaries rather than speculative abstractions.

---

# 29. Deliberately Excluded Architecture

The first version does not require:

- microservices;
- message brokers;
- Redis;
- WebSockets;
- event sourcing;
- CQRS;
- distributed locking systems;
- complex dependency-injection frameworks;
- background synchronization daemons;
- Windows services;
- GUI frameworks;
- runtime AI;
- a permanently running home server.

The architecture should remain a small, understandable system composed of one online backend and one local synchronization client.

---

# 30. Document Boundaries

MusicSync documentation is intentionally divided by responsibility.

```text
REQUIREMENTS.md
    │
    │ What the system must do
    ▼
ARCHITECTURE.md
    │
    │ How the system is organized
    ▼
DATABASE.md
    │
    │ How persistent data is represented
    ▼
API.md
    │
    │ How backend and client communicate
    ▼
PROJECT_STRUCTURE.md
    │
    │ How the architecture becomes source code
    ▼
Implementation
```

Each document should avoid redefining information owned by another document.

`ARCHITECTURE.md` defines the boundaries and relationships.

`PROJECT_STRUCTURE.md` will define the concrete classes, interfaces, files and dependencies that implement those boundaries.
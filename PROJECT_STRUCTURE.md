# MusicSync — Project Structure

## 1. Purpose

This document translates the architectural decisions into a concrete source-code structure.

It defines:

- repository and directory organization;
- main classes and interfaces;
- responsibilities of each component;
- dependency direction;
- testing organization;
- implementation boundaries.

It does **not** define detailed method signatures or implementation algorithms. Those belong to the implementation phase.

The structure should remain simple and understandable by a single developer.

---

## 2. Design Philosophy

MusicSync must be designed for change without introducing unnecessary complexity.

Current technologies and deployment choices are implementation decisions for the first version:

- Cloudflare is the current backend platform;
- D1 is the current database;
- Telegram is the current user interface;
- Windows is the first synchronization client.

They must not become unnecessary architectural constraints.

The project should remain capable of evolving toward:

```text
Telegram ────────┐
Web UI ──────────┤
Future UI ───────┤
                 ▼
             Application
                 │
                 ▼
              Domain
```

and:

```text
                 Backend
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Windows    Linux     macOS
        client    client    client
          │         │         │
         USB       USB       USB
```

The backend itself may also evolve from:

```text
Cloudflare + D1
```

to a local or different remote deployment.

The architecture must therefore isolate infrastructure-specific concerns behind meaningful boundaries.

### Design for change, not for speculation

The project should establish the boundaries that make future changes possible, without implementing or designing every possible future implementation today.

In particular:

> **Design today's boundaries so that tomorrow's changes remain possible, but do not implement tomorrow's components today.**

Current implementation choices should be reasonably reversible. A first-version technology choice should not create an unnecessary architectural dependency that would require rewriting the domain or application logic later.

For example, the project should define a `SongRepository` abstraction because persistence is a meaningful boundary, but it should **not** design a `SQLiteSongRepository` until a local SQLite backend is actually required.

---

# 3. Repository Layout

The repository should have the following high-level structure:

```text
MusicSync/
├── backend/
│   ├── src/
│   ├── migrations/
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
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

The exact number of source files may change during implementation if a simpler organization becomes apparent.

---

# 4. Backend Structure

The backend is organized around domain, application logic, infrastructure, and external interfaces.

```text
backend/
├── src/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── interfaces/
│   └── config/
│
├── migrations/
└── tests/
```

The backend must not place business logic inside Telegram handlers or HTTP handlers.

---

## 4.1 Domain

```text
backend/src/domain/
```

Contains concepts and rules that define MusicSync independently of external technologies.

Main concepts:

```text
Song
SongIdentity
Track
SyncState
SyncPlan
```

Potential supporting domain value objects or enums may be introduced when they provide a clear benefit.

The domain must not depend on:

- Telegram;
- Cloudflare;
- D1;
- HTTP;
- YouTube;
- yt-dlp;
- FFmpeg;
- operating-system APIs;
- filesystem implementations.

The domain should contain as little infrastructure knowledge as possible.

---

## 4.2 Application

```text
backend/src/application/
```

Contains use cases and orchestration of domain operations.

Main responsibilities include:

```text
LibraryService
SearchService
SyncService
```

Examples of application operations:

- add a Song;
- remove a Song;
- list Songs;
- search for candidates;
- validate and process a selected source;
- retrieve synchronization state;
- process synchronization reports.

Application services coordinate domain objects and interfaces but do not contain infrastructure-specific code.

---

## 4.3 Persistence Interfaces

Repository interfaces belong at the application/domain boundary where they are consumed.

Examples:

```text
SongRepository
TrackRepository
SyncStateRepository
```

They represent persistence capabilities rather than a particular database.

Their purpose is to prevent application logic from depending directly on SQL or a database provider.

Current implementation:

```text
SongRepository
      │
      └── D1 implementation
```

Future implementations may include SQLite or another database if required:

```text
SongRepository
      │
      ├── D1 implementation
      └── future implementation
```

No future database implementation should be designed until it is actually needed.

---

# 5. Backend Infrastructure

```text
backend/src/infrastructure/
```

Contains implementations of external dependencies.

Possible areas:

```text
database/
youtube/
telegram/
http/
config/
```

Examples of concrete components:

```text
D1SongRepository
D1TrackRepository
D1SyncStateRepository

YouTubeSearchProvider
YouTubeMetadataProvider
```

Infrastructure code may depend on external libraries and platform APIs.

It must implement the interfaces expected by the application layer rather than leaking those technologies into the domain.

---

# 6. External Interfaces

```text
backend/src/interfaces/
```

Contains entrypoints through which external systems interact with the backend.

Examples:

```text
telegram/
api/
```

### Telegram

The Telegram layer is responsible for:

- receiving Telegram updates;
- parsing commands;
- checking authorization;
- presenting search results;
- handling confirmations;
- converting Telegram interactions into application requests.

It must not:

- execute SQL directly;
- implement duplicate detection;
- implement synchronization rules;
- contain domain logic.

Conceptually:

```text
Telegram
   ↓
Handler
   ↓
Application Service
   ↓
Domain / Repository
```

### HTTP API

The HTTP layer is responsible for:

- receiving API requests;
- validating request structure;
- authentication where required;
- invoking application services;
- serializing responses.

It must not contain business rules.

This same application layer must be usable by a future Web UI/API without copying business logic.

---

# 7. External Provider Interfaces

External services that are meaningful substitution points should be represented by small interfaces.

Examples:

```text
YouTubeSearchProvider
YouTubeMetadataProvider
```

The first implementation may use the YouTube Data API.

Future providers can be introduced without changing the domain model.

The same principle applies to other genuinely replaceable external services.

Interfaces should **not** be created for ordinary internal classes merely to satisfy a theoretical SOLID rule.

---

# 8. Client Structure

The synchronization client is a separate application.

It should be structured around:

```text
client/
└── src/
    ├── domain/
    ├── application/
    ├── infrastructure/
    ├── api/
    ├── cli/
    └── config/
```

The first implementation targets Windows.

The architecture must not make Windows-specific behavior part of the synchronization logic.

---

## 8.1 Client Domain

```text
client/src/domain/
```

Contains concepts needed to reason about physical synchronization.

Examples:

```text
PhysicalTrack
PhysicalState
SyncPlan
SyncResult
```

The exact ownership of shared concepts between backend and client should be decided during implementation; duplicated concepts must not be introduced merely for symmetry.

---

## 8.2 Client Application

```text
client/src/application/
```

Contains the synchronization workflow.

Main components:

```text
SyncService
SyncPlanner
SyncExecutor
```

### SyncService

Coordinates a complete synchronization.

Conceptually:

```text
fetch desired state
        ↓
scan USB
        ↓
create plan
        ↓
execute plan
        ↓
report result
```

### SyncPlanner

Determines what should happen.

Input:

```text
DesiredState
PhysicalState
```

Output:

```text
SyncPlan
```

The planner should be pure or nearly pure and must not perform filesystem or network operations.

### SyncExecutor

Executes an existing `SyncPlan`.

It may use:

```text
FileSystem
Downloader
BackendClient
```

It must not independently redefine synchronization policy.

---

# 9. Client Infrastructure

The client infrastructure isolates operating-system and external-tool dependencies.

Possible components:

```text
filesystem/
downloader/
platform/
```

---

## 9.1 Filesystem Boundary

A filesystem abstraction should isolate the synchronization engine from the operating system.

Conceptually:

```text
FileSystem
    │
    ├── Windows implementation
    └── future Linux implementation
```

The abstraction should cover only the filesystem operations actually required by MusicSync.

It must:

- restrict operations to the configured managed folder;
- support scanning;
- support creating/removing/renaming managed files;
- avoid exposing unnecessary OS-specific details.

This boundary is also the main place where future platform-specific handling can be introduced.

A large generic Hardware Abstraction Layer should **not** be introduced unless Linux or another platform actually requires one.

If platform-specific hardware handling becomes necessary, it should remain below the existing storage/filesystem boundary whenever possible.

---

## 9.2 Downloader

The downloader is isolated behind a small interface:

```text
Downloader
    │
    └── YtDlpDownloader
```

The synchronization logic knows only that a requested source can be downloaded.

The concrete implementation may use:

```text
yt-dlp
FFmpeg
```

The downloader must not decide which Songs should be downloaded.

---

## 9.3 Backend Client

The Windows client communicates with the backend through:

```text
BackendClient
```

Responsibilities include:

- retrieving desired synchronization state;
- reporting synchronization results;
- handling API errors.

The synchronization engine must not know whether the backend is:

- Cloudflare;
- a local server;
- another remote server;
- or another future implementation.

---

# 10. Configuration

Configuration is isolated from business logic.

Backend configuration includes, where applicable:

```text
Telegram bot token
authorized Telegram IDs
YouTube API key
```

Client configuration includes:

```text
backend URL
USB path
managed folder
```

Configuration objects should be passed explicitly to components that require them.

Secrets must not be stored in source code or committed configuration files.

---

# 11. Dependency Direction

Dependencies should generally point inward:

```text
Interfaces
     ↓
Application
     ↓
Domain
```

Infrastructure implements interfaces consumed by the application:

```text
Application
     ↑
Infrastructure
```

The important rule is:

> Domain and application logic must not depend directly on concrete infrastructure.

For example:

```text
BAD

LibraryService
    ↓
D1Database
```

Instead:

```text
GOOD

LibraryService
    ↓
SongRepository
    ↑
D1SongRepository
```

Similarly:

```text
BAD

SyncPlanner
    ↓
Windows filesystem API
```

Instead:

```text
SyncPlanner
    ↓
pure synchronization logic
```

and:

```text
SyncExecutor
    ↓
FileSystem
    ↑
Windows implementation
```

---

# 12. Interfaces and Abstraction Rules

Interfaces should exist at **meaningful substitution boundaries**.

Good candidates include:

```text
SongRepository
TrackRepository
SyncStateRepository

YouTubeSearchProvider
YouTubeMetadataProvider

BackendClient
FileSystem
Downloader
```

Not every class needs an interface.

For example, introducing:

```text
ISyncPlanner
ILibraryService
ISongNormalizer
```

without a real substitution requirement would add complexity without improving the architecture.

The goal is:

```text
small classes
+
clear responsibilities
+
explicit dependencies
+
few meaningful interfaces
```

rather than maximum abstraction.

---

# 13. Tests

Tests should mirror the major responsibilities of the source code.

Backend:

```text
backend/tests/
├── domain/
├── application/
├── infrastructure/
└── interfaces/
```

Client:

```text
client/tests/
├── domain/
├── application/
├── infrastructure/
└── api/
```

Important tests include:

```text
Song identity
Normalization
Duplicate detection
Search ranking
Repository behavior
Authorization
Sync planning
Sync execution
USB scanning
Filename parsing
Download failure
Interrupted operations
API behavior
```

External services should normally be replaced by fakes or test implementations.

Normal tests must not require live Telegram or YouTube access.

The sync planner should be testable without a real USB drive.

---

# 14. Current vs Future Implementations

The first implementation may contain:

```text
Backend
├── Cloudflare Worker
├── D1
├── Telegram
└── YouTube

Sync Client
├── Windows
├── USB filesystem
├── yt-dlp
└── FFmpeg
```

These are concrete implementations, not domain assumptions.

Future configurations may therefore become:

```text
Backend
├── local deployment
├── different remote deployment
└── different database
```

and:

```text
Clients
├── Windows
├── Linux
└── macOS
```

and:

```text
Interfaces
├── Telegram
├── Web API / Web UI
└── future interfaces
```

The first implementation should not contain unused future implementations.

---

# 15. Deployment Flexibility

The code structure must not assume that the entire system always has one fixed deployment topology.

Possible future configurations include:

```text
Remote backend
    +
Windows client
```

```text
Remote backend
    +
Linux client
```

```text
Local backend
    +
Linux client
```

```text
Local backend
    +
Linux client
    +
Web UI
```

or hybrid configurations.

The deployment topology belongs to infrastructure and deployment configuration, not to the domain model.

Changing deployment should not require rewriting the core library and synchronization rules.

---

# 16. Implementation Order

Implementation should proceed from the most stable concepts toward concrete infrastructure.

Recommended order:

```text
1. Domain models and rules
        ↓
2. Repository/provider interfaces
        ↓
3. Database implementation
        ↓
4. Application services
        ↓
5. Backend API
        ↓
6. Telegram interface
        ↓
7. Client domain
        ↓
8. Sync planner
        ↓
9. Filesystem implementation
        ↓
10. Downloader
        ↓
11. Sync executor
        ↓
12. Integration
        ↓
13. Packaging
```

Each stage should remain testable before the next major stage is added.

---

# 17. What This Structure Deliberately Avoids

The first implementation should not introduce:

- a generic enterprise-style Clean Architecture framework;
- interfaces for every class;
- a generic Hardware Abstraction Layer without a concrete need;
- multiple database implementations;
- multiple backend implementations;
- multiple sync clients;
- complex dependency injection frameworks;
- microservices;
- event sourcing;
- CQRS;
- message brokers;
- Redis;
- unnecessary background processes;
- GUI-specific architecture.

The structure should remain small enough that its organization can be understood by inspecting the repository.

---

# 18. Relationship With Other Design Documents

Each design document has a distinct responsibility.

```text
REQUIREMENTS.md
    What must MusicSync do?
          ↓
ARCHITECTURE.md
    How are the major components organized?
          ↓
DATABASE.md
    How is persistent data represented?
          ↓
API.md
    How do components communicate?
          ↓
PROJECT_STRUCTURE.md
    How do those decisions become source code?
```

This document must not duplicate the complete requirements, database schema, or API specification.

It only translates those decisions into code organization, responsibilities and dependencies.

---

# 19. Final Structural Principle

The project structure is considered successful if the following changes can be made without rewriting the domain unnecessarily:

```text
Cloudflare → another backend platform
D1 → another database
Telegram → Web UI
Windows → Linux
Windows → macOS
remote deployment → local deployment
```

This does **not** mean that every future change must require zero code changes.

It means that changes should remain localized to the boundaries where they belong.

The architecture should therefore optimize for:

> **low coupling, clear boundaries, and reversible implementation choices — without speculative complexity.**
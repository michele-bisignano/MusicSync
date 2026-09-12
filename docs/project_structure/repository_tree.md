```text
MusicSync/
├── .claude/
│   └── settings.local.json
├── .gitignore
├── backend/
│   ├── .dev.vars.example
│   ├── deploy_setup.sh
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── package-lock.json
│   ├── package.json
│   ├── src/
│   │   ├── domain/
│   │   │   ├── normalization.ts
│   │   │   ├── song.ts
│   │   │   ├── sync_state.ts
│   │   │   ├── track.ts
│   │   │   └── version_type.ts
│   │   ├── global.d.ts
│   │   ├── index.ts
│   │   ├── library/
│   │   │   ├── duplicate_checker.ts
│   │   │   └── library_service.ts
│   │   ├── persistence/
│   │   │   ├── d1_database.ts
│   │   │   ├── song_repository.ts
│   │   │   ├── sync_state_repository.ts
│   │   │   └── track_repository.ts
│   │   ├── search/
│   │   │   ├── candidate_ranker.ts
│   │   │   ├── metadata_provider.ts
│   │   │   ├── search_service.ts
│   │   │   ├── source_provider.ts
│   │   │   ├── spotify_provider.ts
│   │   │   ├── youtube_search_provider.ts
│   │   │   └── youtube_source_provider.ts
│   │   ├── sync/
│   │   │   ├── auth.ts
│   │   │   ├── sync_handler.ts
│   │   │   ├── sync_service.ts
│   │   │   └── sync_types.ts
│   │   ├── telegram/
│   │   │   ├── telegram_authorizer.ts
│   │   │   ├── telegram_client.ts
│   │   │   ├── telegram_factory.ts
│   │   │   ├── telegram_formatter.ts
│   │   │   ├── telegram_handler.ts
│   │   │   └── telegram_types.ts
│   │   ├── types.ts
│   │   └── validation/
│   │       └── youtube_url.ts
│   ├── tests/
│   │   ├── domain/
│   │   │   └── normalization.test.ts
│   │   ├── health.test.ts
│   │   ├── library/
│   │   │   └── library_service.test.ts
│   │   ├── persistence/
│   │   │   ├── d1_test_helper.ts
│   │   │   ├── migration.test.ts
│   │   │   ├── song_repository.test.ts
│   │   │   ├── sync_state_repository.test.ts
│   │   │   └── track_repository.test.ts
│   │   ├── search/
│   │   │   ├── candidate_ranker.test.ts
│   │   │   └── search_service.test.ts
│   │   ├── sync/
│   │   │   ├── auth.test.ts
│   │   │   ├── sync_handler.test.ts
│   │   │   └── sync_service.test.ts
│   │   ├── telegram/
│   │   │   ├── telegram_authorizer.test.ts
│   │   │   ├── telegram_formatter.test.ts
│   │   │   └── telegram_handler.test.ts
│   │   └── validation/
│   │       └── youtube_url.test.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── worker-configuration.d.ts
│   └── wrangler.toml
├── bun.lock
├── CLAUDE.md
├── client/
│   ├── config.example.toml
│   ├── MusicSync_icon.ico
│   ├── pyproject.toml
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   │   └── music_sync/
│   │       ├── __init__.py
│   │       ├── __main__.py
│   │       ├── application/
│   │       │   ├── __init__.py
│   │       │   ├── executor.py
│   │       │   ├── importer.py
│   │       │   ├── planner.py
│   │       │   └── sync_service.py
│   │       ├── cli/
│   │       │   ├── __init__.py
│   │       │   ├── main.py
│   │       │   └── parser.py
│   │       ├── config.py
│   │       ├── domain/
│   │       │   ├── __init__.py
│   │       │   ├── filename_parser.py
│   │       │   ├── models.py
│   │       │   └── normalization.py
│   │       └── infrastructure/
│   │           ├── __init__.py
│   │           ├── backend_client.py
│   │           ├── downloader.py
│   │           └── filesystem.py
│   └── tests/
│       ├── application/
│       │   ├── test_executor.py
│       │   ├── test_importer.py
│       │   ├── test_planner.py
│       │   └── test_sync_service.py
│       ├── cli/
│       │   ├── test_cli.py
│       │   └── test_sync_cli.py
│       ├── domain/
│       │   ├── test_filename_parser.py
│       │   └── test_normalization.py
│       └── infrastructure/
│           ├── test_backend_client.py
│           ├── test_downloader.py
│           └── test_filesystem.py
├── DEVELOPMENT_PLAN.md
├── docs/
│   ├── design/
│   │   ├── API.md
│   │   ├── ARCHITECTURE.md
│   │   ├── DATABASE.md
│   │   └── REQUIREMENTS.md
│   ├── project_structure/
│   │   └── repository_tree.md
│   └── PROJECT_STRUCTURE.md
├── LICENSE
├── metadata.json
├── package-lock.json
├── package.json
├── public/
│   ├── MusicSync_icon.ico
│   └── MusicSync_icon.png
├── README.md
├── requirements.txt
├── tools/
│   └── project_tree/
│       ├── generate_tree.py
│       ├── README.md
│       └── setup_hook.py
└── tsconfig.json
```

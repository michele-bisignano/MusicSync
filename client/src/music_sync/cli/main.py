"""
Main CLI entrypoint for the MusicSync client.
Handles full synchronization and --import-usb workflows with rich terminal formatting.
"""

import sys
from typing import List, Optional

from ..application.importer import UsbImporter
from ..application.sync_service import SyncService
from ..config import ConfigurationError, load_config
from ..domain.models import PlanAction
from ..infrastructure.backend_client import (
    BackendAuthenticationError,
    BackendClient,
    BackendClientError,
    BackendConflictError,
    BackendConnectionError,
    BackendServerError,
    BackendValidationError,
)
from ..infrastructure.downloader import DownloaderError, YtDlpDownloader
from ..infrastructure.filesystem import (
    FileSystem,
    FileSystemError,
    PathTraversalSecurityError,
    UsbUnavailableError,
)
from .parser import create_cli_parser


def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """Formats columns into a clean ASCII table."""
    if not rows:
        return "(no operations)"

    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))

    header_line = " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers))
    separator_line = "-+-".join("-" * col_widths[i] for i in range(len(headers)))
    data_lines = [
        " | ".join(cell.ljust(col_widths[i]) for i, cell in enumerate(row))
        for row in rows
    ]

    return "\n".join([header_line, separator_line] + data_lines)


def run_cli(args: Optional[List[str]] = None) -> int:
    """
    Executes the command-line interface.
    Returns standard process exit code (0 = success, 1 = failure).
    """
    parser = create_cli_parser()
    parsed_args = parser.parse_args(args)

    # Collect CLI overrides
    cli_overrides = {
        k: v
        for k, v in {
            "usb_path": parsed_args.usb_path,
            "managed_folder": parsed_args.managed_folder,
            "backend_url": parsed_args.backend_url,
            "sync_token": parsed_args.sync_token,
        }.items()
        if v is not None
    }

    try:
        # Load configuration
        # If dry-run, require_backend is only mandatory if running full sync
        require_backend = not (parsed_args.import_usb and parsed_args.dry_run)
        config = load_config(
            config_path=parsed_args.config,
            cli_overrides=cli_overrides,
            require_backend=require_backend,
        )
    except ConfigurationError as e:
        print(f"[ERROR] Configuration error: {e}", file=sys.stderr)
        return 1

    # Initialize infrastructure
    fs = FileSystem(
        usb_path=config.usb_path,
        managed_folder=config.managed_folder,
    )

    if not fs.is_usb_available():
        print(
            f"[ERROR] USB path is not accessible: {fs.usb_path}",
            file=sys.stderr,
        )
        return 1

    backend: Optional[BackendClient] = None
    if config.backend_url and config.sync_token:
        backend = BackendClient(
            backend_url=config.backend_url,
            sync_token=config.sync_token,
            timeout=config.timeout,
        )

    # 1. Handle --import-usb action
    if parsed_args.import_usb:
        importer = UsbImporter(filesystem=fs, backend_client=backend)
        print(f"[INFO] Scanning USB folder for import: {fs.managed_root}")

        try:
            result = importer.run_import(dry_run=parsed_args.dry_run)
        except UsbUnavailableError as e:
            print(f"[ERROR] USB device unavailable: {e}", file=sys.stderr)
            return 1
        except PathTraversalSecurityError as e:
            print(f"[SECURITY ERROR] {e}", file=sys.stderr)
            return 1
        except FileSystemError as e:
            print(f"[ERROR] Filesystem error: {e}", file=sys.stderr)
            return 1
        except BackendAuthenticationError as e:
            print(f"[ERROR] Backend authentication failed (HTTP 401). Verify SYNC_TOKEN: {e}", file=sys.stderr)
            return 1
        except BackendConflictError as e:
            print(f"[ERROR] Version conflict on backend: {e}", file=sys.stderr)
            return 1
        except BackendValidationError as e:
            print(f"[ERROR] Validation error reported by backend: {e}", file=sys.stderr)
            return 1
        except BackendConnectionError as e:
            print(f"[ERROR] Could not connect to backend server: {e}", file=sys.stderr)
            return 1
        except BackendServerError as e:
            print(f"[ERROR] Backend server returned error: {e}", file=sys.stderr)
            return 1
        except BackendClientError as e:
            print(f"[ERROR] Backend API error: {e}", file=sys.stderr)
            return 1

        if result.dry_run:
            print(f"\n[DRY-RUN] Discovered {len(result.scanned_tracks)} physical MP3 file(s):")
            headers = ["#", "File Path", "Artist", "Title", "Version"]
            rows = [
                [
                    str(i + 1),
                    track.relative_path,
                    track.artist,
                    track.title,
                    track.version_type.value,
                ]
                for i, track in enumerate(result.scanned_tracks)
            ]
            print(format_table(headers, rows))
            print(f"\n[DRY-RUN] Summary: {len(result.operations)} track(s) would be cataloged to the remote database.")
            print("[DRY-RUN] No changes were made to the database or filesystem.")
            return 0

        print(f"\n[SUCCESS] USB import completed successfully!")
        print(f"[INFO] Discovered tracks: {len(result.scanned_tracks)}")
        print(f"[INFO] Songs newly cataloged in database: {result.songs_imported}")
        print(f"[INFO] Tracks confirmed: {result.tracks_confirmed}")
        print(f"[INFO] New sync version: {result.sync_version}")
        print("[INFO] Imported songs are now immediately visible and manageable via Telegram /list and /remove.")
        return 0

    # 2. Handle default Full Synchronization
    if backend is None:
        print("[ERROR] Backend URL and SYNC_TOKEN are required for synchronization.", file=sys.stderr)
        return 1

    downloader = YtDlpDownloader(
        quiet=not parsed_args.verbose,
        rate_limit_backoff=config.rate_limit_backoff,
        max_retries=config.max_retries_per_track,
    )
    sync_service = SyncService(
        backend_client=backend,
        filesystem=fs,
        downloader=downloader,
        download_delay_min=config.download_delay_min,
        download_delay_max=config.download_delay_max,
    )

    print(f"[INFO] Starting synchronization for USB folder: {fs.managed_root}")

    try:
        plan, result = sync_service.synchronize(dry_run=parsed_args.dry_run)
    except UsbUnavailableError as e:
        print(f"[ERROR] USB device unavailable: {e}", file=sys.stderr)
        return 1
    except PathTraversalSecurityError as e:
        print(f"[SECURITY ERROR] {e}", file=sys.stderr)
        return 1
    except FileSystemError as e:
        print(f"[ERROR] Filesystem error: {e}", file=sys.stderr)
        return 1
    except BackendAuthenticationError as e:
        print(f"[ERROR] Backend authentication failed (HTTP 401). Verify SYNC_TOKEN: {e}", file=sys.stderr)
        return 1
    except BackendConflictError as e:
        print(f"[ERROR] Version conflict on backend (HTTP 409): {e}", file=sys.stderr)
        return 1
    except BackendValidationError as e:
        print(f"[ERROR] Validation error reported by backend: {e}", file=sys.stderr)
        return 1
    except BackendConnectionError as e:
        print(f"[ERROR] Could not connect to backend server: {e}", file=sys.stderr)
        return 1
    except BackendServerError as e:
        print(f"[ERROR] Backend server returned error: {e}", file=sys.stderr)
        return 1
    except BackendClientError as e:
        print(f"[ERROR] Backend API error: {e}", file=sys.stderr)
        return 1
    except DownloaderError as e:
        print(f"[ERROR] Audio downloader error: {e}", file=sys.stderr)
        return 1

    # Format Dry-Run preview
    if parsed_args.dry_run:
        print(f"\n[DRY-RUN] Synchronization Plan (Version {plan.sync_version}):")
        headers = ["Action", "File Path", "Artist", "Title", "Reason / Source"]
        rows = [
            [
                item.action.value.upper(),
                item.relative_path,
                item.artist,
                item.title,
                item.reason or (item.youtube_url or "-"),
            ]
            for item in plan.items
        ]
        print(format_table(headers, rows))
        print(
            f"\n[DRY-RUN] Plan Summary: "
            f"{len(plan.to_keep)} keep, "
            f"{len(plan.to_download)} download, "
            f"{len(plan.to_delete)} delete, "
            f"{len(plan.to_import)} import, "
            f"{len(plan.warnings)} warnings."
        )
        print("[DRY-RUN] No changes were made to the filesystem or database.")
        return 0

    # Live execution results
    assert result is not None
    print(f"\n[SYNC RESULT] Status: {result.status.upper()}")
    print(f"[INFO] Synced Version: {result.acknowledged_version}")
    print(f"[INFO] Downloaded: {result.downloaded_count}")
    print(f"[INFO] Deleted: {result.deleted_count}")
    print(f"[INFO] Imported: {result.imported_count}")

    if result.failed_downloads:
        print(f"\n[WARN] Failed downloads ({len(result.failed_downloads)}):", file=sys.stderr)
        for item, err in result.failed_downloads:
            print(f"  - {item.title} - {item.artist} ({item.relative_path}): {err}", file=sys.stderr)

    if result.failed_deletions:
        print(f"\n[WARN] Failed deletions ({len(result.failed_deletions)}):", file=sys.stderr)
        for item, err in result.failed_deletions:
            print(f"  - {item.relative_path}: {err}", file=sys.stderr)

    if result.status != "success":
        return 1

    print("[SUCCESS] USB synchronization finished cleanly.")
    return 0


def main() -> None:
    """Standard console entrypoint."""
    exit_code = run_cli()
    if getattr(sys, "frozen", False):
        try:
            input("\nPremi INVIO per uscire...")
        except (EOFError, KeyboardInterrupt):
            pass
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

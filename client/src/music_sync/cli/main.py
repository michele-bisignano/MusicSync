"""
Main CLI entrypoint for the MusicSync client.
Handles commands like --import-usb and orchestrates application services.
"""

import sys
from typing import List, Optional

from ..application.importer import UsbImporter
from ..config import ConfigurationError, load_config
from ..infrastructure.backend_client import (
    BackendAuthenticationError,
    BackendClient,
    BackendClientError,
    BackendConflictError,
    BackendConnectionError,
    BackendServerError,
    BackendValidationError,
)
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
        return "(no tracks discovered)"

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

    if not parsed_args.import_usb:
        print("[INFO] MusicSync CLI 0.1.0")
        print("[INFO] Use --import-usb to scan and catalog physical USB tracks.")
        print("[INFO] Use --help for full usage instructions.")
        return 0

    try:
        # Load configuration
        # If dry-run, allow running without backend credentials if none are provided
        require_backend = not parsed_args.dry_run
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
    if not parsed_args.dry_run and config.backend_url and config.sync_token:
        backend = BackendClient(
            backend_url=config.backend_url,
            sync_token=config.sync_token,
            timeout=config.timeout,
        )

    # Run USB import flow
    importer = UsbImporter(filesystem=fs, backend_client=backend)

    print(f"[INFO] Scanning USB folder: {fs.managed_root}")

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

    # Display results
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


def main() -> None:
    """Standard console entrypoint."""
    sys.exit(run_cli())


if __name__ == "__main__":
    main()

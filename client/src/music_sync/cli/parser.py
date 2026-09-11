"""
CLI argument parser configuration for MusicSync.
"""

import argparse


def create_cli_parser() -> argparse.ArgumentParser:
    """Creates and configures the command-line argument parser."""
    parser = argparse.ArgumentParser(
        prog="music-sync",
        description="MusicSync: Lightweight music synchronizer for physical USB drives.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m music_sync --import-usb --dry-run
  python -m music_sync --import-usb --usb-path D:\\
  python -m music_sync --import-usb --config config.toml
        """,
    )

    # Core action flags
    action_group = parser.add_argument_group("Actions")
    action_group.add_argument(
        "--import-usb",
        action="store_true",
        help="Scan physical USB drive and catalog existing MP3 files to the remote database.",
    )

    # Modifiers
    modifier_group = parser.add_argument_group("Modifiers")
    modifier_group.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview all operations without contacting the API or modifying files/database.",
    )
    modifier_group.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable detailed debug logging output.",
    )

    # Configuration overrides
    config_group = parser.add_argument_group("Configuration")
    config_group.add_argument(
        "-c",
        "--config",
        type=str,
        default=None,
        help="Path to TOML configuration file (defaults to config.local.toml / config.toml).",
    )
    config_group.add_argument(
        "--usb-path",
        type=str,
        default=None,
        help="Path to the USB drive root directory (e.g. 'D:\\' or '/media/usb').",
    )
    config_group.add_argument(
        "--managed-folder",
        type=str,
        default=None,
        help="Managed subfolder on the USB drive (default: 'Music').",
    )
    config_group.add_argument(
        "--backend-url",
        type=str,
        default=None,
        help="URL of the Cloudflare Worker backend API.",
    )
    config_group.add_argument(
        "--sync-token",
        type=str,
        default=None,
        help="Pre-shared secret token for backend authentication.",
    )

    # Informational
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 0.1.0",
    )

    return parser

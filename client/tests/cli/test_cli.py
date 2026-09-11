"""
Tests for CLI parser and command orchestration.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from music_sync.cli.main import format_table, run_cli
from music_sync.cli.parser import create_cli_parser
from music_sync.domain.models import SyncStateSnapshot


def test_parser_arguments():
    parser = create_cli_parser()

    args = parser.parse_args(["--import-usb", "--dry-run", "--usb-path", "/mnt/usb", "--verbose"])
    assert args.import_usb is True
    assert args.dry_run is True
    assert args.usb_path == "/mnt/usb"
    assert args.verbose is True


def test_format_table():
    headers = ["#", "File Path", "Artist", "Title", "Version"]
    rows = [["1", "Song - Artist.mp3", "Artist", "Song", "standard"]]
    table = format_table(headers, rows)
    assert "File Path" in table
    assert "Song - Artist.mp3" in table


def test_run_cli_no_args():
    exit_code = run_cli([])
    assert exit_code == 0


def test_run_cli_import_dry_run(tmp_path: Path, capsys):
    usb_dir = tmp_path / "usb"
    music_dir = usb_dir / "Music"
    music_dir.mkdir(parents=True)
    (music_dir / "Queen - Bohemian Rhapsody.mp3").write_bytes(b"dummy")

    exit_code = run_cli([
        "--import-usb",
        "--dry-run",
        "--usb-path",
        str(usb_dir),
    ])

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "[DRY-RUN]" in captured.out
    assert "Queen - Bohemian Rhapsody.mp3" in captured.out


def test_run_cli_missing_usb_path(tmp_path: Path):
    non_existent = tmp_path / "non_existent_drive"
    exit_code = run_cli([
        "--import-usb",
        "--dry-run",
        "--usb-path",
        str(non_existent),
    ])
    assert exit_code == 1


def test_run_cli_missing_backend_config(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    (usb_dir / "Music").mkdir()

    # Without dry-run, missing backend credentials must fail configuration
    with patch("music_sync.config._find_default_config_file", return_value=None):
        exit_code = run_cli([
            "--import-usb",
            "--usb-path",
            str(usb_dir),
            "--backend-url",
            "",
            "--sync-token",
            "",
        ])
    assert exit_code == 1

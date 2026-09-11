"""
Integration and CLI tests for MusicSync full synchronization and import flows.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from music_sync.cli.main import run_cli
from music_sync.domain.models import (
    DesiredTrackDto,
    SyncStateSnapshot,
    VersionType,
)


def test_cli_full_sync_dry_run(tmp_path: Path, capsys):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    mock_backend = MagicMock()
    mock_backend.get_health.return_value = {"status": "ok"}
    mock_backend.get_sync_state.return_value = SyncStateSnapshot(
        sync_version=25,
        desired_tracks=[
            DesiredTrackDto(
                song_id=4,
                artist="Adele",
                title="Hello",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=hello123456",
                relative_path="Hello - Adele.mp3",
            )
        ],
        obsolete_tracks=[],
    )

    with patch("music_sync.cli.main.BackendClient", return_value=mock_backend):
        exit_code = run_cli(
            [
                "--dry-run",
                "--usb-path",
                str(usb_dir),
                "--managed-folder",
                "Music",
                "--backend-url",
                "https://test-worker.dev",
                "--sync-token",
                "secret-token",
            ]
        )

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "[DRY-RUN] Synchronization Plan" in captured.out
    assert "DOWNLOAD" in captured.out
    assert "Hello - Adele.mp3" in captured.out
    assert "1 download" in captured.out


def test_cli_full_sync_live(tmp_path: Path, capsys):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    mock_backend = MagicMock()
    mock_backend.get_health.return_value = {"status": "ok"}
    mock_backend.get_sync_state.return_value = SyncStateSnapshot(
        sync_version=30,
        desired_tracks=[
            DesiredTrackDto(
                song_id=9,
                artist="Coldplay",
                title="Clocks",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=clock123456",
                relative_path="Clocks - Coldplay.mp3",
            )
        ],
        obsolete_tracks=[],
    )
    mock_backend.post_sync_report.return_value = {
        "acknowledged": True,
        "sync_version": 30,
        "summary": {"tracks_confirmed": 1, "tracks_removed": 0, "songs_imported": 0},
    }

    mock_downloader = MagicMock()

    def fake_dl(*args, **kwargs):
        dest = kwargs.get("destination_path") or (args[1] if len(args) > 1 else None)
        if dest:
            Path(dest).write_bytes(b"downloaded mp3")
            return Path(dest)
        return Path("/tmp/mock.mp3")

    mock_downloader.download_track.side_effect = fake_dl

    with patch("music_sync.cli.main.BackendClient", return_value=mock_backend):
        with patch("music_sync.cli.main.YtDlpDownloader", return_value=mock_downloader):
            exit_code = run_cli(
                [
                    "--usb-path",
                    str(usb_dir),
                    "--managed-folder",
                    "Music",
                    "--backend-url",
                    "https://test-worker.dev",
                    "--sync-token",
                    "secret-token",
                ]
            )

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "[SUCCESS] USB synchronization finished cleanly." in captured.out
    assert mock_downloader.download_track.called
    assert (managed_dir / "Clocks - Coldplay.mp3").exists()
    mock_backend.post_sync_report.assert_called_once()


def test_cli_usb_unavailable_returns_error(tmp_path: Path, capsys):
    non_existent = tmp_path / "non_existent_usb"

    exit_code = run_cli(
        [
            "--usb-path",
            str(non_existent),
            "--backend-url",
            "https://test-worker.dev",
            "--sync-token",
            "secret-token",
        ]
    )

    assert exit_code == 1
    captured = capsys.readouterr()
    assert "[ERROR] USB path is not accessible" in captured.err

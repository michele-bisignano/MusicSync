"""
Tests for UsbImporter application service.
"""

from pathlib import Path
from unittest.mock import MagicMock
import pytest

from music_sync.application.importer import UsbImporter
from music_sync.domain.models import DesiredTrackDto, SyncStateSnapshot, VersionType
from music_sync.infrastructure.backend_client import BackendClient
from music_sync.infrastructure.filesystem import FileSystem


@pytest.fixture
def mock_filesystem(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    music_dir = usb_dir / "Music"
    music_dir.mkdir(parents=True)

    (music_dir / "Queen - Bohemian Rhapsody.mp3").write_bytes(b"data")
    (music_dir / "Eagles - Hotel California (Live).mp3").write_bytes(b"data")

    return FileSystem(usb_path=usb_dir, managed_folder="Music")


def test_importer_dry_run(mock_filesystem):
    importer = UsbImporter(filesystem=mock_filesystem, backend_client=None)
    result = importer.run_import(dry_run=True)

    assert result.dry_run is True
    assert len(result.scanned_tracks) == 2
    assert len(result.operations) == 2
    assert result.operations[0].song.artist == "Eagles" or result.operations[0].song.artist == "Queen"
    assert result.operations[0].song.youtube_url is None
    assert result.acknowledged is True


def test_importer_real_execution(mock_filesystem):
    mock_backend = MagicMock(spec=BackendClient)
    mock_backend.get_sync_state.return_value = SyncStateSnapshot(
        sync_version=3,
        desired_tracks=[],
        obsolete_tracks=[],
    )
    mock_backend.post_sync_report.return_value = {
        "acknowledged": True,
        "sync_version": 4,
        "summary": {
            "songs_imported": 2,
            "tracks_confirmed": 0,
            "tracks_removed": 0,
        },
    }

    importer = UsbImporter(filesystem=mock_filesystem, backend_client=mock_backend)
    result = importer.run_import(dry_run=False)

    assert result.dry_run is False
    assert result.songs_imported == 2
    assert result.sync_version == 4
    assert result.acknowledged is True

    mock_backend.get_sync_state.assert_called_once()
    mock_backend.post_sync_report.assert_called_once()
    call_args = mock_backend.post_sync_report.call_args[0][0]
    assert call_args["sync_version"] == 3
    assert call_args["status"] == "success"
    assert len(call_args["operations"]) == 2
    assert call_args["operations"][0]["type"] == "import"
    assert call_args["operations"][0]["song"]["youtube_url"] is None


def test_importer_empty_folder(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    (usb_dir / "Music").mkdir(parents=True)
    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")

    mock_backend = MagicMock(spec=BackendClient)
    importer = UsbImporter(filesystem=fs, backend_client=mock_backend)
    result = importer.run_import(dry_run=False)

    assert result.songs_imported == 0
    assert len(result.scanned_tracks) == 0
    # Does not contact backend if there are no operations
    mock_backend.post_sync_report.assert_not_called()

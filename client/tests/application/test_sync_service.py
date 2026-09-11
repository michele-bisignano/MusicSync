"""
Unit tests for SyncService application coordinator.
"""

from pathlib import Path
from unittest.mock import MagicMock
import pytest

from music_sync.application.sync_service import SyncService
from music_sync.domain.models import (
    DesiredTrackDto,
    PlanAction,
    SyncExecutionResult,
    SyncPlan,
    SyncPlanItem,
    SyncStateSnapshot,
    VersionType,
)
from music_sync.infrastructure.filesystem import FileSystem, UsbUnavailableError


def test_sync_service_dry_run_flow(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    backend_client = MagicMock()
    backend_client.get_health.return_value = {"status": "ok"}
    backend_client.get_sync_state.return_value = SyncStateSnapshot(
        sync_version=10,
        desired_tracks=[
            DesiredTrackDto(
                song_id=1,
                artist="Daft Punk",
                title="Get Lucky",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=12345678901",
                relative_path="Get Lucky - Daft Punk.mp3",
            )
        ],
        obsolete_tracks=[],
    )

    downloader = MagicMock()
    service = SyncService(
        backend_client=backend_client,
        filesystem=fs,
        downloader=downloader,
    )

    plan, result = service.synchronize(dry_run=True)

    assert result is None
    assert plan.sync_version == 10
    assert len(plan.to_download) == 1
    assert plan.to_download[0].song_id == 1
    # Downloader and report must not have been invoked
    downloader.download_track.assert_not_called()
    backend_client.post_sync_report.assert_not_called()


def test_sync_service_live_flow(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    backend_client = MagicMock()
    backend_client.get_health.return_value = {"status": "ok"}
    backend_client.get_sync_state.return_value = SyncStateSnapshot(
        sync_version=10,
        desired_tracks=[
            DesiredTrackDto(
                song_id=1,
                artist="Daft Punk",
                title="Get Lucky",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=12345678901",
                relative_path="Get Lucky - Daft Punk.mp3",
            )
        ],
        obsolete_tracks=[],
    )
    backend_client.post_sync_report.return_value = {
        "acknowledged": True,
        "sync_version": 10,
        "summary": {"tracks_confirmed": 1, "tracks_removed": 0, "songs_imported": 0},
    }

    downloader = MagicMock()

    def fake_download(youtube_url, destination_path, **kwargs):
        Path(destination_path).write_bytes(b"dummy audio")
        return Path(destination_path)

    downloader.download_track.side_effect = fake_download

    service = SyncService(
        backend_client=backend_client,
        filesystem=fs,
        downloader=downloader,
    )

    plan, result = service.synchronize(dry_run=False)

    assert result is not None
    assert result.status == "success"
    assert result.downloaded_count == 1
    assert (managed_dir / "Get Lucky - Daft Punk.mp3").exists()
    backend_client.post_sync_report.assert_called_once()


def test_sync_service_usb_unavailable():
    fs = FileSystem(usb_path=Path("/non/existent/usb/drive/12345"), managed_folder="Music")
    backend_client = MagicMock()
    backend_client.get_health.return_value = {"status": "ok"}
    backend_client.get_sync_state.return_value = SyncStateSnapshot(sync_version=1)
    downloader = MagicMock()

    service = SyncService(
        backend_client=backend_client,
        filesystem=fs,
        downloader=downloader,
    )

    with pytest.raises(UsbUnavailableError):
        service.synchronize()

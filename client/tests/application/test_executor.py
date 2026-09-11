"""
Unit tests for SyncExecutor component.
Verifies execution of downloads, deletions, imports and report generation to the backend.
"""

from pathlib import Path
from unittest.mock import MagicMock
import pytest

from music_sync.application.executor import SyncExecutor
from music_sync.domain.models import (
    PlanAction,
    SyncPlan,
    SyncPlanItem,
    VersionType,
)
from music_sync.infrastructure.downloader import Downloader, DownloaderError
from music_sync.infrastructure.filesystem import FileSystem


class MockDownloader(Downloader):
    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail
        self.downloaded_urls: list[str] = []

    def download_track(
        self,
        youtube_url: str,
        destination_path: Path,
        artist: str,
        title: str,
        version_type: str = "standard",
    ) -> Path:
        if self.should_fail:
            raise DownloaderError(f"Simulated download error for {youtube_url}")
        self.downloaded_urls.append(youtube_url)
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_path.write_bytes(b"\xFF\xFB\x90\x00" + b"\x00" * 100)
        return destination_path


def test_executor_successful_run(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    # Pre-existing file to delete
    old_file = managed_dir / "Old Track - Band.mp3"
    old_file.write_text("old audio")

    # Stray part file from interrupted download
    stray_part = managed_dir / "interrupted.mp3.part"
    stray_part.write_text("partial")

    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    downloader = MockDownloader()
    backend_client = MagicMock()
    backend_client.post_sync_report.return_value = {
        "acknowledged": True,
        "sync_version": 43,
        "summary": {"tracks_confirmed": 1, "tracks_removed": 1, "songs_imported": 1},
    }

    plan = SyncPlan(
        sync_version=42,
        items=[
            SyncPlanItem(
                action=PlanAction.DOWNLOAD,
                relative_path="New Song - Singer.mp3",
                artist="Singer",
                title="New Song",
                youtube_url="https://youtube.com/watch?v=new12345678",
                song_id=10,
            ),
            SyncPlanItem(
                action=PlanAction.DELETE,
                relative_path="Old Track - Band.mp3",
                artist="Band",
                title="Old Track",
                song_id=20,
            ),
            SyncPlanItem(
                action=PlanAction.IMPORT,
                relative_path="Uncataloged - USB.mp3",
                artist="USB",
                title="Uncataloged",
                version_type=VersionType.STANDARD,
            ),
        ],
    )

    executor = SyncExecutor(
        filesystem=fs,
        downloader=downloader,
        backend_client=backend_client,
    )

    result = executor.execute(plan)

    assert result.status == "success"
    assert result.sync_version == 42
    assert result.acknowledged_version == 43
    assert result.downloaded_count == 1
    assert result.deleted_count == 1
    assert result.imported_count == 1

    # Verify physical filesystem changes
    assert (managed_dir / "New Song - Singer.mp3").exists()
    assert not old_file.exists()
    assert not stray_part.exists()

    # Verify backend report payload
    backend_client.post_sync_report.assert_called_once()
    payload = backend_client.post_sync_report.call_args[0][0]
    assert payload["sync_version"] == 42
    assert payload["status"] == "success"
    assert len(payload["operations"]) == 3
    op_types = [op["type"] for op in payload["operations"]]
    assert "import" in op_types
    assert "delete" in op_types
    assert "download" in op_types


def test_executor_partial_download_failure(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    managed_dir = usb_dir / "Music"
    managed_dir.mkdir()

    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    downloader = MockDownloader(should_fail=True)
    backend_client = MagicMock()
    backend_client.post_sync_report.return_value = {
        "acknowledged": True,
        "sync_version": 42,
    }

    plan = SyncPlan(
        sync_version=42,
        items=[
            SyncPlanItem(
                action=PlanAction.DOWNLOAD,
                relative_path="Failing Song - Artist.mp3",
                artist="Artist",
                title="Failing Song",
                youtube_url="https://youtube.com/watch?v=fail1234567",
                song_id=15,
            )
        ],
    )

    executor = SyncExecutor(
        filesystem=fs,
        downloader=downloader,
        backend_client=backend_client,
    )

    result = executor.execute(plan)

    assert result.status == "failed"
    assert result.downloaded_count == 0
    assert len(result.failed_downloads) == 1
    assert "Simulated download error" in result.failed_downloads[0][1]

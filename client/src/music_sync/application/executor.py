"""
SyncExecutor application component.
Executes a SyncPlan by orchestrating FileSystem deletions, Downloader audio acquisitions,
and sending the final consolidated report to the Backend API.
"""

import random
import time
from typing import Any, Dict, List, Tuple

from ..domain.models import (
    PlanAction,
    SyncExecutionResult,
    SyncPlan,
    SyncPlanItem,
)
from ..infrastructure.backend_client import BackendClient
from ..infrastructure.downloader import Downloader, DownloaderError
from ..infrastructure.filesystem import FileSystem, FileSystemError


class SyncExecutor:
    """
    Executes a SyncPlan deterministically with built-in pacing and rate limit respect.
    """

    def __init__(
        self,
        filesystem: FileSystem,
        downloader: Downloader,
        backend_client: BackendClient,
        download_delay_min: float = 2.0,
        download_delay_max: float = 4.0,
    ):
        self.filesystem = filesystem
        self.downloader = downloader
        self.backend_client = backend_client
        self.download_delay_min = max(0.0, download_delay_min)
        self.download_delay_max = max(self.download_delay_min, download_delay_max)

    def execute(self, plan: SyncPlan) -> SyncExecutionResult:
        """
        Executes the planned operations (imports, deletions, downloads)
        and sends the final execution report to the backend.
        """
        # Ensure managed directory exists and clean up any leftover .part files
        self.filesystem.ensure_managed_folder()
        self.filesystem.cleanup_part_files()

        report_operations: List[Dict[str, Any]] = []
        downloaded_count = 0
        deleted_count = 0
        imported_count = 0

        failed_downloads: List[Tuple[SyncPlanItem, str]] = []
        failed_deletions: List[Tuple[SyncPlanItem, str]] = []
        failed_imports: List[Tuple[SyncPlanItem, str]] = []

        # 1. Process Imports (New uncataloged files discovered on USB)
        for item in plan.to_import:
            try:
                version_val = (
                    item.version_type.value
                    if hasattr(item.version_type, "value")
                    else str(item.version_type)
                )
                report_operations.append(
                    {
                        "type": "import",
                        "song": {
                            "artist": item.artist,
                            "title": item.title,
                            "version_type": version_val,
                            "youtube_url": item.youtube_url,
                        },
                        "relative_path": item.relative_path,
                    }
                )
                imported_count += 1
            except Exception as e:
                failed_imports.append((item, str(e)))

        # 2. Process Deletions (Obsolete tracks soft-deleted in library)
        for item in plan.to_delete:
            try:
                self.filesystem.delete_file(item.relative_path)
                deleted_count += 1
                if item.song_id is not None:
                    report_operations.append(
                        {
                            "type": "delete",
                            "song_id": item.song_id,
                            "relative_path": item.relative_path,
                        }
                    )
            except FileSystemError as e:
                failed_deletions.append((item, str(e)))

        # 3. Process Downloads (Desired tracks missing physically on USB)
        valid_downloads = [item for item in plan.to_download if item.youtube_url]
        total_downloads = len(valid_downloads)

        for idx, item in enumerate(valid_downloads, start=1):
            assert item.youtube_url is not None
            print(f"[DOWNLOAD {idx}/{total_downloads}] '{item.title} - {item.artist}' da YouTube...")

            try:
                dest_path = self.filesystem.resolve_safe_path(item.relative_path)
                version_val = (
                    item.version_type.value
                    if hasattr(item.version_type, "value")
                    else str(item.version_type)
                )
                self.downloader.download_track(
                    youtube_url=item.youtube_url,
                    destination_path=dest_path,
                    artist=item.artist,
                    title=item.title,
                    version_type=version_val,
                )
                downloaded_count += 1
                if item.song_id is not None:
                    report_operations.append(
                        {
                            "type": "download",
                            "song_id": item.song_id,
                            "relative_path": item.relative_path,
                        }
                    )

                # Pacing delay between successive downloads to avoid YouTube bot throttling
                if idx < total_downloads and self.download_delay_max > 0:
                    delay = random.uniform(self.download_delay_min, self.download_delay_max)
                    if delay > 0:
                        time.sleep(delay)

            except (DownloaderError, FileSystemError, Exception) as e:
                failed_downloads.append((item, str(e)))

        # 4. Submit Sync Report to Backend
        acknowledged_version = plan.sync_version
        status = (
            "success"
            if (len(failed_downloads) == 0 and len(failed_deletions) == 0 and len(failed_imports) == 0)
            else "failed"
        )

        if report_operations:
            report_payload = {
                "sync_version": plan.sync_version,
                "status": status,
                "operations": report_operations,
            }
            try:
                resp = self.backend_client.post_sync_report(report_payload)
                if isinstance(resp, dict) and "sync_version" in resp:
                    acknowledged_version = int(resp["sync_version"])
            except Exception as e:
                # If report submission fails, mark overall status as failed
                status = "failed"

        return SyncExecutionResult(
            sync_version=plan.sync_version,
            downloaded_count=downloaded_count,
            deleted_count=deleted_count,
            imported_count=imported_count,
            failed_downloads=failed_downloads,
            failed_deletions=failed_deletions,
            failed_imports=failed_imports,
            acknowledged_version=acknowledged_version,
            status=status,
        )

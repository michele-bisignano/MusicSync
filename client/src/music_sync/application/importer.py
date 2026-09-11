"""
USB Importer Application Service.
Orchestrates scanning physical USB drives, extracting track metadata,
and cataloging existing libraries into the remote D1 database via the sync API.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..domain.models import ImportOperation, ImportSongData, PhysicalTrack
from ..infrastructure.backend_client import BackendClient
from ..infrastructure.filesystem import FileSystem


@dataclass
class UsbImportResult:
    scanned_tracks: List[PhysicalTrack] = field(default_factory=list)
    operations: List[ImportOperation] = field(default_factory=list)
    dry_run: bool = False
    songs_imported: int = 0
    tracks_confirmed: int = 0
    sync_version: int = 0
    acknowledged: bool = False
    details: Dict[str, Any] = field(default_factory=dict)


class UsbImporter:
    """
    Application service that scans pre-existing files on a USB drive
    and registers them as cataloged songs in the remote backend.
    """

    def __init__(self, filesystem: FileSystem, backend_client: Optional[BackendClient] = None):
        self.fs = filesystem
        self.backend = backend_client

    def scan_tracks(self) -> List[PhysicalTrack]:
        """Scans the physical MANAGED_FOLDER and returns all detected MP3 tracks."""
        return self.fs.scan_managed_folder()

    def build_import_operations(self, tracks: List[PhysicalTrack]) -> List[ImportOperation]:
        """
        Builds a list of import operations from scanned physical tracks.
        Sets youtube_url=None per requirements so tracks are cataloged without audio downloads.
        """
        operations: List[ImportOperation] = []
        for track in tracks:
            op = ImportOperation(
                relative_path=track.relative_path,
                song=ImportSongData(
                    artist=track.artist,
                    title=track.title,
                    version_type=track.version_type.value,
                    youtube_url=None,
                ),
            )
            operations.append(op)
        return operations

    def run_import(self, dry_run: bool = False) -> UsbImportResult:
        """
        Executes the import flow.
        If dry_run is True, returns planned actions without contacting the backend.
        If dry_run is False, sends the import report to POST /api/v1/sync/report.
        """
        scanned_tracks = self.scan_tracks()
        operations = self.build_import_operations(scanned_tracks)

        if dry_run or not self.backend:
            return UsbImportResult(
                scanned_tracks=scanned_tracks,
                operations=operations,
                dry_run=True,
                songs_imported=len(operations),
                tracks_confirmed=0,
                sync_version=0,
                acknowledged=True,
            )

        if not operations:
            return UsbImportResult(
                scanned_tracks=[],
                operations=[],
                dry_run=False,
                songs_imported=0,
                tracks_confirmed=0,
                sync_version=0,
                acknowledged=True,
            )

        # 1. Fetch current sync state from backend
        sync_state = self.backend.get_sync_state()
        current_version = sync_state.sync_version

        # 2. Build report payload
        payload: Dict[str, Any] = {
            "sync_version": current_version,
            "status": "success",
            "operations": [op.to_dict() for op in operations],
        }

        # 3. Submit report to backend
        report_response = self.backend.post_sync_report(payload)
        summary = report_response.get("summary", {})

        return UsbImportResult(
            scanned_tracks=scanned_tracks,
            operations=operations,
            dry_run=False,
            songs_imported=int(summary.get("songs_imported", 0)),
            tracks_confirmed=int(summary.get("tracks_confirmed", 0)),
            sync_version=int(report_response.get("sync_version", current_version)),
            acknowledged=bool(report_response.get("acknowledged", False)),
            details=report_response,
        )

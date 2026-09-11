"""
SyncService application coordinator.
Orchestrates the complete synchronization lifecycle:
1. Validates backend health
2. Fetches remote desired state snapshot
3. Checks USB accessibility and scans physical files in MANAGED_FOLDER
4. Plans reconciliation actions via SyncPlanner
5. Executes changes and sends reports via SyncExecutor (or previews via dry-run)
"""

from typing import Optional, Tuple

from ..domain.models import (
    SyncExecutionResult,
    SyncPlan,
)
from ..infrastructure.backend_client import BackendClient
from ..infrastructure.downloader import Downloader
from ..infrastructure.filesystem import FileSystem, UsbUnavailableError
from .executor import SyncExecutor
from .planner import SyncPlanner


class SyncService:
    """
    High-level synchronization orchestrator.
    """

    def __init__(
        self,
        backend_client: BackendClient,
        filesystem: FileSystem,
        downloader: Downloader,
        planner: Optional[SyncPlanner] = None,
        executor: Optional[SyncExecutor] = None,
    ):
        self.backend_client = backend_client
        self.filesystem = filesystem
        self.downloader = downloader
        self.planner = planner or SyncPlanner()
        self.executor = executor or SyncExecutor(
            filesystem=self.filesystem,
            downloader=self.downloader,
            backend_client=self.backend_client,
        )

    def synchronize(self, dry_run: bool = False) -> Tuple[SyncPlan, Optional[SyncExecutionResult]]:
        """
        Executes a complete synchronization run.
        If dry_run is True, plans and returns without modifying USB or posting reports.
        """
        # 1. Verify backend connectivity
        self.backend_client.get_health()

        # 2. Fetch current desired state snapshot
        desired_state = self.backend_client.get_sync_state()

        # 3. Verify USB drive accessibility
        if not self.filesystem.is_usb_available():
            raise UsbUnavailableError(
                f"Configured USB drive path '{self.filesystem.usb_path}' is not accessible"
            )

        # 4. Scan physical MP3 files inside MANAGED_FOLDER
        physical_tracks = self.filesystem.scan_managed_folder()

        # 5. Plan reconciliation
        plan = self.planner.create_plan(
            desired_state=desired_state,
            physical_tracks=physical_tracks,
        )

        # 6. If dry-run, return plan immediately without executing
        if dry_run:
            return plan, None

        # 7. Execute plan
        result = self.executor.execute(plan)
        return plan, result

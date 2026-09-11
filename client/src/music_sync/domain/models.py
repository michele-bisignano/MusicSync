"""
MusicSync Domain Models
Defines core domain entities and value objects for the synchronization client.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class VersionType(str, Enum):
    STANDARD = "standard"
    COVER = "cover"
    REMIX = "remix"
    ACOUSTIC = "acoustic"
    LIVE = "live"


def parse_version_type(val: Optional[str]) -> VersionType:
    if not val:
        return VersionType.STANDARD
    lower = val.strip().lower()
    for item in VersionType:
        if item.value == lower:
            return item
    return VersionType.STANDARD


@dataclass(frozen=True)
class SongIdentity:
    """
    Logical identity of a song: normalized artist + normalized title + version type.
    """
    normalized_artist: str
    normalized_title: str
    version_type: VersionType = VersionType.STANDARD


@dataclass
class PhysicalTrack:
    """
    Represents a physical MP3 file discovered on the USB drive within MANAGED_FOLDER.
    relative_path is strictly relative to MANAGED_FOLDER (e.g. 'Queen - Don't Stop Me Now.mp3').
    """
    relative_path: str
    filename: str
    artist: str
    title: str
    normalized_artist: str
    normalized_title: str
    version_type: VersionType = VersionType.STANDARD

    @property
    def identity(self) -> SongIdentity:
        return SongIdentity(
            normalized_artist=self.normalized_artist,
            normalized_title=self.normalized_title,
            version_type=self.version_type,
        )


@dataclass
class DesiredTrackDto:
    song_id: int
    artist: str
    title: str
    version_type: VersionType
    youtube_url: Optional[str]
    relative_path: str


@dataclass
class ObsoleteTrackDto:
    song_id: int
    artist: str
    title: str
    relative_path: str


@dataclass
class SyncStateSnapshot:
    sync_version: int
    desired_tracks: list[DesiredTrackDto] = field(default_factory=list)
    obsolete_tracks: list[ObsoleteTrackDto] = field(default_factory=list)


@dataclass
class ImportSongData:
    artist: str
    title: str
    version_type: str = "standard"
    youtube_url: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "artist": self.artist,
            "title": self.title,
            "version_type": self.version_type,
            "youtube_url": self.youtube_url,
        }


@dataclass
class ImportOperation:
    relative_path: str
    song: ImportSongData

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "import",
            "song": self.song.to_dict(),
            "relative_path": self.relative_path,
        }


class PlanAction(str, Enum):
    KEEP = "keep"
    DOWNLOAD = "download"
    DELETE = "delete"
    IMPORT = "import"
    WARN_MISSING_SOURCE = "warn_missing_source"


@dataclass
class SyncPlanItem:
    action: PlanAction
    relative_path: str
    artist: str
    title: str
    version_type: VersionType = VersionType.STANDARD
    youtube_url: Optional[str] = None
    song_id: Optional[int] = None
    reason: str = ""


@dataclass
class SyncPlan:
    sync_version: int
    items: list[SyncPlanItem] = field(default_factory=list)

    @property
    def to_keep(self) -> list[SyncPlanItem]:
        return [item for item in self.items if item.action == PlanAction.KEEP]

    @property
    def to_download(self) -> list[SyncPlanItem]:
        return [item for item in self.items if item.action == PlanAction.DOWNLOAD]

    @property
    def to_delete(self) -> list[SyncPlanItem]:
        return [item for item in self.items if item.action == PlanAction.DELETE]

    @property
    def to_import(self) -> list[SyncPlanItem]:
        return [item for item in self.items if item.action == PlanAction.IMPORT]

    @property
    def warnings(self) -> list[SyncPlanItem]:
        return [item for item in self.items if item.action == PlanAction.WARN_MISSING_SOURCE]

    @property
    def is_empty(self) -> bool:
        """Returns True if there are no actionable operations (downloads, deletes, imports)."""
        return (
            len(self.to_download) == 0
            and len(self.to_delete) == 0
            and len(self.to_import) == 0
        )


@dataclass
class SyncExecutionResult:
    sync_version: int
    downloaded_count: int = 0
    deleted_count: int = 0
    imported_count: int = 0
    failed_downloads: list[tuple[SyncPlanItem, str]] = field(default_factory=list)
    failed_deletions: list[tuple[SyncPlanItem, str]] = field(default_factory=list)
    failed_imports: list[tuple[SyncPlanItem, str]] = field(default_factory=list)
    acknowledged_version: Optional[int] = None
    status: str = "success"

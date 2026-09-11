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

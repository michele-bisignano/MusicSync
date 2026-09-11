"""
MusicSync Domain Package
"""

from .models import (
    DesiredTrackDto,
    ImportOperation,
    ImportSongData,
    ObsoleteTrackDto,
    PhysicalTrack,
    SongIdentity,
    SyncStateSnapshot,
    VersionType,
    parse_version_type,
)
from .normalization import (
    calculate_token_overlap,
    detect_version_type,
    normalize_string,
    strip_video_clutter,
)
from .filename_parser import (
    ParsedFilename,
    format_default_relative_path,
    parse_mp3_filename,
    sanitize_filename_part,
)

__all__ = [
    "DesiredTrackDto",
    "ImportOperation",
    "ImportSongData",
    "ObsoleteTrackDto",
    "PhysicalTrack",
    "SongIdentity",
    "SyncStateSnapshot",
    "VersionType",
    "parse_version_type",
    "calculate_token_overlap",
    "detect_version_type",
    "normalize_string",
    "strip_video_clutter",
    "ParsedFilename",
    "format_default_relative_path",
    "parse_mp3_filename",
    "sanitize_filename_part",
]

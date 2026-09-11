"""
Filename parser and path sanitizer for MusicSync.
Supports scanning and cataloging MP3 files from physical USB drives.
"""

from dataclasses import dataclass
import re
from pathlib import Path
from typing import Optional

from .models import VersionType
from .normalization import detect_version_type, strip_video_clutter


@dataclass
class ParsedFilename:
    artist: str
    title: str
    version_type: VersionType
    confidence: str  # "high", "medium", "fallback"


# Regex to strip leading track numbering (e.g. "01 - ", "01. ", "1-01 ", "A1. ", "01_")
TRACK_NUMBER_PREFIX = re.compile(
    r"^(?:(?:cd\s*\d+[\s\-_]+)?\d{1,3}(?:[-_.]\d{1,3})?[\s\.\-_]+|[a-z]\d{1,2}[\s\.\-_]+)",
    re.IGNORECASE,
)

# Reserved device names on Windows that cannot be used as filenames
RESERVED_WINDOWS_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
}


def sanitize_filename_part(text: str) -> str:
    """
    Sanitizes a string to be safely used as a filename component across
    Windows, Linux, and macOS platforms.
    Removes illegal Windows characters (< > : " / \\ | ? * and ASCII 0-31),
    collapses whitespace, and trims trailing dots and spaces.
    """
    if not text:
        return ""

    # Replace illegal characters with spaces
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1F]', " ", text)
    # Collapse consecutive spaces
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    # Windows does not permit trailing dots or spaces
    sanitized = re.sub(r"[. ]+$", "", sanitized)

    if sanitized.upper() in RESERVED_WINDOWS_NAMES:
        sanitized = f"{sanitized}_"

    return sanitized


def format_default_relative_path(
    artist: str,
    title: str,
    version_type: VersionType = VersionType.STANDARD,
) -> str:
    """
    Generates the canonical relative path for a song:
    'Title - Artist.mp3' or 'Title - Artist (Version).mp3'
    Per REQUIREMENTS.md Section 32: Title - Artist.mp3 distribution for car stereos.
    """
    clean_artist = sanitize_filename_part(artist) or "Unknown Artist"
    clean_title = sanitize_filename_part(title) or "Unknown Title"

    version_suffix = ""
    if version_type != VersionType.STANDARD:
        detected = detect_version_type(clean_title)
        if detected != version_type:
            label = version_type.value.capitalize()
            version_suffix = f" ({label})"

    return f"{clean_title} - {clean_artist}{version_suffix}.mp3"


def parse_mp3_filename(filename_or_path: str) -> ParsedFilename:
    """
    Parses an MP3 filename or relative path and extracts Artist, Title, and VersionType.
    Handles:
    - Leading track numbers (e.g. "01 - Bohemian Rhapsody - Queen.mp3", "02. Song.mp3")
    - "Title - Artist" and "Artist - Title" formats
    - Embedded version tags: "(Live)", "[Remix]", "(Acoustic)", etc.
    - Clutter removal: "(Official Video)", "[Lyrics]", etc.
    - Single-name files with no separator (e.g. "Bohemian Rhapsody.mp3")
    """
    # Extract only the filename without directories
    raw_name = Path(filename_or_path).name

    # Strip .mp3 extension if present
    if raw_name.lower().endswith(".mp3"):
        raw_name = raw_name[:-4]

    # Detect version from raw string before stripping clutter
    version_type = detect_version_type(raw_name)

    # Strip video clutter
    cleaned = strip_video_clutter(raw_name)

    # Strip leading track numbers
    cleaned = TRACK_NUMBER_PREFIX.sub("", cleaned).strip()

    # If version is indicated in parentheses at the end (e.g. "Song (Live)"), clean it from title
    # if it's already detected as version
    if version_type != VersionType.STANDARD:
        # Don't strip if it's part of the actual title phrase
        pass

    # Split on common separators: " - ", " – ", " — ", " : ", " _ "
    separator_match = re.search(r"\s+[-–—:_]\s+", cleaned)
    if separator_match:
        part1 = cleaned[:separator_match.start()].strip()
        part2 = cleaned[separator_match.end():].strip()

        part1_clean = sanitize_filename_part(part1)
        part2_clean = sanitize_filename_part(part2)

        if part1_clean and part2_clean:
            # Check if there is another separator in part2 (e.g. "01 - Artist - Title")
            sub_sep = re.search(r"\s+[-–—:_]\s+", part2_clean)
            if sub_sep:
                sub_part1 = part2_clean[:sub_sep.start()].strip()
                sub_part2 = part2_clean[sub_sep.end():].strip()
                if sub_part1 and sub_part2:
                    part1_clean = sub_part1
                    part2_clean = sub_part2

            # Determine whether part1 is Title or Artist
            # Both conventions are valid. We preserve both parts cleanly.
            # When in doubt, part1 as Title or Artist:
            # If part2 has "feat." or "ft.", part1 is almost certainly Artist
            # When feat. is present in part1 or part2:
            if re.search(r"\b(?:feat|ft)\.?\b", part1_clean, re.IGNORECASE):
                artist = part1_clean
                title = part2_clean
            elif re.search(r"\b(?:feat|ft)\.?\b", part2_clean, re.IGNORECASE):
                artist = part1_clean
                title = part2_clean
            else:
                artist = part1_clean
                title = part2_clean

            return ParsedFilename(
                artist=artist,
                title=title,
                version_type=version_type,
                confidence="high",
            )

    # Fallback: Single name or no standard separator
    fallback_title = sanitize_filename_part(cleaned) or "Unknown Title"
    return ParsedFilename(
        artist="Unknown Artist",
        title=fallback_title,
        version_type=version_type,
        confidence="fallback",
    )

"""
Filesystem infrastructure abstraction.
Strictly isolates physical filesystem operations within the configured MANAGED_FOLDER.
Prevents path traversal attacks and handles OS differences (Windows/Linux/macOS).
"""

from pathlib import Path
from typing import List, Optional

from ..domain.filename_parser import parse_mp3_filename
from ..domain.models import PhysicalTrack
from ..domain.normalization import normalize_string, strip_video_clutter


class FileSystemError(Exception):
    """Base exception for filesystem operations."""
    pass


class UsbUnavailableError(FileSystemError):
    """Raised when the configured USB drive path cannot be accessed."""
    pass


class PathTraversalSecurityError(FileSystemError):
    """Raised when an operation attempts to escape the managed folder."""
    pass


class FileSystem:
    """
    Filesystem abstraction strictly isolating all operations to MANAGED_FOLDER.
    """

    def __init__(self, usb_path: str | Path, managed_folder: str = "Music"):
        self.usb_path = Path(usb_path).resolve()
        self.managed_folder_name = managed_folder.strip().strip("/\\")
        self.managed_root = (self.usb_path / self.managed_folder_name).resolve()

    def is_usb_available(self) -> bool:
        """Checks whether the USB root path exists and is a directory."""
        try:
            return self.usb_path.exists() and self.usb_path.is_dir()
        except OSError:
            return False

    def is_managed_folder_available(self) -> bool:
        """Checks whether the managed folder exists and is a directory."""
        try:
            return self.managed_root.exists() and self.managed_root.is_dir()
        except OSError:
            return False

    def ensure_managed_folder(self) -> None:
        """Creates the managed folder if it does not already exist."""
        if not self.is_usb_available():
            raise UsbUnavailableError(
                f"USB drive is not accessible at path: {self.usb_path}"
            )
        try:
            self.managed_root.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise FileSystemError(
                f"Failed to create managed directory '{self.managed_root}': {e}"
            ) from e

    def resolve_safe_path(self, relative_path: str) -> Path:
        """
        Resolves a relative path to an absolute path inside MANAGED_FOLDER.
        Guarantees that the resulting path cannot escape MANAGED_FOLDER.
        """
        clean_rel = relative_path.strip().lstrip("/\\")
        resolved = (self.managed_root / clean_rel).resolve()

        try:
            resolved.relative_to(self.managed_root)
        except ValueError as e:
            raise PathTraversalSecurityError(
                f"Path traversal detected: '{relative_path}' escapes managed folder '{self.managed_root}'"
            ) from e

        return resolved

    def scan_managed_folder(self) -> List[PhysicalTrack]:
        """
        Scans MANAGED_FOLDER recursively, discovering all MP3 files.
        Ignores temporary files (.part), non-MP3 files, hidden files, and files outside the folder.
        Returns a deterministically sorted list of PhysicalTrack objects.
        """
        if not self.is_usb_available():
            raise UsbUnavailableError(
                f"USB root directory not found or inaccessible: {self.usb_path}"
            )

        if not self.is_managed_folder_available():
            # Managed folder does not exist yet; return empty list safely
            return []

        tracks: List[PhysicalTrack] = []

        try:
            for file_path in self.managed_root.rglob("*"):
                # Skip directories
                if not file_path.is_file():
                    continue

                # Security check: ensure file is inside managed_root
                try:
                    rel_path = file_path.relative_to(self.managed_root).as_posix()
                except ValueError:
                    continue

                # Filter out hidden or system files (starting with '.' or '$')
                if file_path.name.startswith((".", "$")):
                    continue

                # Skip download temporary files (.part, .tmp)
                if file_path.name.lower().endswith((".part", ".tmp", ".ytdl")):
                    continue

                # Only process .mp3 audio files
                if not file_path.name.lower().endswith(".mp3"):
                    continue

                # Parse filename
                parsed = parse_mp3_filename(file_path.name)
                norm_artist = normalize_string(parsed.artist)
                norm_title = normalize_string(strip_video_clutter(parsed.title))

                tracks.append(
                    PhysicalTrack(
                        relative_path=rel_path,
                        filename=file_path.name,
                        artist=parsed.artist,
                        title=parsed.title,
                        normalized_artist=norm_artist,
                        normalized_title=norm_title,
                        version_type=parsed.version_type,
                    )
                )
        except OSError as e:
            raise FileSystemError(f"Error scanning managed directory '{self.managed_root}': {e}") from e

        # Sort deterministically by relative path
        tracks.sort(key=lambda t: t.relative_path.lower())
        return tracks

    def file_exists(self, relative_path: str) -> bool:
        """Checks if a file exists safely inside MANAGED_FOLDER."""
        try:
            target = self.resolve_safe_path(relative_path)
            return target.is_file()
        except (PathTraversalSecurityError, OSError):
            return False

    def delete_file(self, relative_path: str) -> bool:
        """
        Safely deletes a file inside MANAGED_FOLDER.
        Returns True if the file existed and was deleted, False if it was already absent.
        """
        target = self.resolve_safe_path(relative_path)
        if not target.exists():
            return False
        try:
            target.unlink()
            return True
        except OSError as e:
            raise FileSystemError(f"Failed to delete file '{target}': {e}") from e

    def cleanup_part_files(self) -> int:
        """
        Removes all leftover temporary download files (.part, .tmp, .ytdl) in MANAGED_FOLDER.
        Returns the number of removed files.
        """
        if not self.is_managed_folder_available():
            return 0
        removed_count = 0
        try:
            for temp_file in self.managed_root.rglob("*"):
                if temp_file.is_file() and temp_file.name.lower().endswith((".part", ".tmp", ".ytdl")):
                    try:
                        temp_file.unlink()
                        removed_count += 1
                    except OSError:
                        pass
        except OSError as e:
            raise FileSystemError(f"Error cleaning temporary files in '{self.managed_root}': {e}") from e
        return removed_count

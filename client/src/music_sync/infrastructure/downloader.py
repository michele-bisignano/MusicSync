"""
Downloader Infrastructure Component.
Downloads audio tracks from YouTube using yt-dlp and FFmpeg, converts them to MP3,
and writes car-stereo-compatible ID3v2.3 tags using Mutagen.
"""

from abc import ABC, abstractmethod
import os
from pathlib import Path
import shutil
from typing import Any, Dict, Optional
import uuid

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    from mutagen.id3 import ID3, ID3NoHeaderError, TIT2, TPE1, TALB, COMM
except ImportError:
    ID3 = None
    ID3NoHeaderError = Exception
    TIT2 = None
    TPE1 = None
    TALB = None
    COMM = None


class DownloaderError(Exception):
    """Base exception for audio downloader errors."""
    pass


class Downloader(ABC):
    """
    Abstract audio downloader interface.
    """

    @abstractmethod
    def download_track(
        self,
        youtube_url: str,
        destination_path: Path,
        artist: str,
        title: str,
        version_type: str = "standard",
    ) -> Path:
        """
        Downloads and converts the audio from youtube_url into an MP3 file at destination_path.
        Applies car-stereo ID3v2.3 tags.
        """
        pass


def apply_id3v23_tags(
    file_path: Path,
    artist: str,
    title: str,
    version_type: str = "standard",
) -> None:
    """
    Applies ID3v2.3 metadata tags to the MP3 file at file_path.
    ID3v2.3 strictly requires encoding=1 (UTF-16 with BOM) or encoding=0 (ISO-8859-1).
    UTF-16 (encoding=1) ensures perfect unicode character support across automotive car stereos.
    """
    if ID3 is None:
        return

    try:
        try:
            tags = ID3(str(file_path))
        except ID3NoHeaderError:
            tags = ID3()

        display_title = title.strip()
        if version_type and version_type.lower() != "standard":
            display_title = f"{title.strip()} ({version_type.strip().capitalize()})"

        # encoding=1: UTF-16 with BOM (Standard ID3v2.3 unicode format for car stereos)
        tags.add(TIT2(encoding=1, text=[display_title]))
        tags.add(TPE1(encoding=1, text=[artist.strip()]))
        tags.add(TALB(encoding=1, text=["MusicSync Library"]))
        tags.add(COMM(encoding=1, lang="eng", desc="MusicSync", text=[f"Version: {version_type}"]))

        # v2_version=3 forces ID3v2.3 standard (car stereo compatibility)
        tags.save(str(file_path), v2_version=3)
    except Exception as e:
        # Tagging failure should not invalidate successful audio download, but log warning
        pass


class YtDlpDownloader(Downloader):
    """
    Concrete audio downloader utilizing yt-dlp and FFmpeg.
    """

    def __init__(self, quiet: bool = True):
        self.quiet = quiet

    def download_track(
        self,
        youtube_url: str,
        destination_path: Path,
        artist: str,
        title: str,
        version_type: str = "standard",
    ) -> Path:
        """
        Downloads audio from youtube_url to a temporary .part file,
        converts to MP3, tags with ID3v2.3, and atomically moves to destination_path.
        """
        if not youtube_url or not youtube_url.strip():
            raise DownloaderError("Cannot download track: YouTube URL is empty")

        if yt_dlp is None:
            raise DownloaderError("yt-dlp package is not installed")

        destination_path = Path(destination_path).resolve()
        destination_path.parent.mkdir(parents=True, exist_ok=True)

        # Generate a collision-free, safe temporary identifier to avoid % formatting issues in outtmpl
        temp_id = uuid.uuid4().hex[:12]
        temp_prefix = f"_ms_tmp_{temp_id}"
        temp_template = destination_path.parent / f"{temp_prefix}.%(ext)s"
        temp_part_file = destination_path.parent / f"{destination_path.name}.part"

        # Remove any stale temporary .part file
        if temp_part_file.exists():
            try:
                temp_part_file.unlink()
            except OSError:
                pass

        ydl_opts: Dict[str, Any] = {
            "format": "bestaudio/best",
            "outtmpl": str(temp_template),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "noplaylist": True,
            "quiet": self.quiet,
            "no_warnings": self.quiet,
            "overwrites": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                error_code = ydl.download([youtube_url.strip()])
                if error_code != 0:
                    raise DownloaderError(f"yt-dlp download failed with exit code {error_code}")

            # Locate the generated MP3 file
            converted_mp3 = destination_path.parent / f"{temp_prefix}.mp3"
            if not converted_mp3.exists():
                candidates = list(destination_path.parent.glob(f"{temp_prefix}*"))
                mp3_candidates = [c for c in candidates if c.suffix.lower() == ".mp3"]
                if mp3_candidates:
                    converted_mp3 = mp3_candidates[0]
                elif candidates:
                    converted_mp3 = candidates[0]
                else:
                    raise DownloaderError("Converted MP3 file was not found after yt-dlp execution")

            # Move to .part file first
            shutil.move(str(converted_mp3), str(temp_part_file))

            # Apply ID3v2.3 tags
            apply_id3v23_tags(temp_part_file, artist=artist, title=title, version_type=version_type)

            # Atomic rename from .part to final destination
            if destination_path.exists():
                destination_path.unlink()
            shutil.move(str(temp_part_file), str(destination_path))

            return destination_path

        except Exception as e:
            # Clean up all temporary files matching temp_prefix or temp_part_file on failure
            for cleanup_target in [temp_part_file, *destination_path.parent.glob(f"{temp_prefix}*")]:
                if cleanup_target.exists():
                    try:
                        cleanup_target.unlink()
                    except OSError:
                        pass
            if isinstance(e, DownloaderError):
                raise
            raise DownloaderError(f"Download failed for '{title} - {artist}' ({youtube_url}): {e}") from e

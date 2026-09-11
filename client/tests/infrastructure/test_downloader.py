"""
Unit tests for Downloader infrastructure and ID3v2.3 tagger.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from music_sync.infrastructure.downloader import (
    DownloaderError,
    YtDlpDownloader,
    apply_id3v23_tags,
)


def test_apply_id3v23_tags(tmp_path: Path):
    # Create dummy mp3 file
    mp3_file = tmp_path / "test.mp3"
    mp3_file.write_bytes(b"\xFF\xFB\x90\x00" + b"\x00" * 500)

    apply_id3v23_tags(
        file_path=mp3_file,
        artist="Queen",
        title="Bohemian Rhapsody",
        version_type="remix",
    )

    # Read back tags with Mutagen if available
    try:
        from mutagen.id3 import ID3
        tags = ID3(str(mp3_file))
        assert tags.version == (2, 3, 0)  # ID3v2.3 standard
        assert "Queen" in tags["TPE1"].text
        assert "Bohemian Rhapsody (Remix)" in tags["TIT2"].text
    except ImportError:
        pass


def test_ytdlp_downloader_empty_url(tmp_path: Path):
    downloader = YtDlpDownloader()
    dest = tmp_path / "song.mp3"

    with pytest.raises(DownloaderError, match="YouTube URL is empty"):
        downloader.download_track(
            youtube_url="",
            destination_path=dest,
            artist="Artist",
            title="Title",
        )


def test_ytdlp_downloader_successful_flow(tmp_path: Path):
    downloader = YtDlpDownloader()
    dest = tmp_path / "Get Lucky - Daft Punk.mp3"

    # Mock yt_dlp.YoutubeDL
    mock_ydl_instance = MagicMock()

    def fake_download(urls):
        # Extract outtmpl from call args and create the simulated downloaded mp3
        opts = mock_ydl_class.call_args[0][0]
        outtmpl = opts["outtmpl"].replace("%(ext)s", "mp3")
        Path(outtmpl).write_bytes(b"\xFF\xFB\x90\x00" + b"\x00" * 500)
        return 0

    mock_ydl_instance.download.side_effect = fake_download
    mock_ydl_class = MagicMock(return_value=mock_ydl_instance)
    mock_ydl_instance.__enter__.return_value = mock_ydl_instance
    mock_ydl_instance.__exit__.return_value = False

    with patch("music_sync.infrastructure.downloader.yt_dlp.YoutubeDL", mock_ydl_class):
        result = downloader.download_track(
            youtube_url="https://www.youtube.com/watch?v=12345678901",
            destination_path=dest,
            artist="Daft Punk",
            title="Get Lucky",
            version_type="standard",
        )

        assert result == dest
        assert dest.exists()
        # Verify temporary .part file was cleaned up
        part_file = tmp_path / f"{dest.name}.part"
        assert not part_file.exists()


def test_ytdlp_downloader_failure_cleans_up_part_files(tmp_path: Path):
    downloader = YtDlpDownloader()
    dest = tmp_path / "Failed - Track.mp3"

    mock_ydl_instance = MagicMock()
    mock_ydl_instance.download.side_effect = RuntimeError("Network stream error")
    mock_ydl_class = MagicMock(return_value=mock_ydl_instance)
    mock_ydl_instance.__enter__.return_value = mock_ydl_instance
    mock_ydl_instance.__exit__.return_value = False

    with patch("music_sync.infrastructure.downloader.yt_dlp.YoutubeDL", mock_ydl_class):
        with pytest.raises(DownloaderError, match="Download failed"):
            downloader.download_track(
                youtube_url="https://www.youtube.com/watch?v=err12345678",
                destination_path=dest,
                artist="Artist",
                title="Failed Track",
            )

        assert not dest.exists()
        assert not (tmp_path / f"{dest.name}.part").exists()

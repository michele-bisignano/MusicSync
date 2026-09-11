"""
Tests for filesystem infrastructure.
"""

from pathlib import Path
import pytest
from music_sync.domain.models import VersionType
from music_sync.infrastructure.filesystem import (
    FileSystem,
    PathTraversalSecurityError,
    UsbUnavailableError,
)


def test_filesystem_availability(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")

    assert not fs.is_usb_available()
    assert not fs.is_managed_folder_available()

    usb_dir.mkdir()
    assert fs.is_usb_available()
    assert not fs.is_managed_folder_available()

    fs.ensure_managed_folder()
    assert fs.is_managed_folder_available()


def test_filesystem_scanning(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    music_dir = usb_dir / "Music"
    music_dir.mkdir(parents=True)

    # Valid MP3 files
    (music_dir / "Queen - Bohemian Rhapsody.mp3").write_bytes(b"dummy mp3")
    (music_dir / "Eagles - Hotel California (Live).mp3").write_bytes(b"dummy mp3")

    # Nested subfolder with MP3
    rock_dir = music_dir / "Rock"
    rock_dir.mkdir()
    (rock_dir / "ACDC - Back in Black.mp3").write_bytes(b"dummy mp3")

    # Files that must be ignored
    (music_dir / "album_art.jpg").write_bytes(b"dummy jpg")
    (music_dir / "track.part").write_bytes(b"temporary download")
    (music_dir / ".hidden_file.mp3").write_bytes(b"hidden")
    (usb_dir / "OtherFolder").mkdir()
    (usb_dir / "OtherFolder" / "Outside.mp3").write_bytes(b"outside")

    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    tracks = fs.scan_managed_folder()

    assert len(tracks) == 3

    # Check relative paths
    rel_paths = [t.relative_path for t in tracks]
    assert "Queen - Bohemian Rhapsody.mp3" in rel_paths
    assert "Eagles - Hotel California (Live).mp3" in rel_paths
    assert "Rock/ACDC - Back in Black.mp3" in rel_paths

    # Check version detection
    eagles_track = next(t for t in tracks if "Hotel California" in t.title)
    assert eagles_track.version_type == VersionType.LIVE


def test_filesystem_path_traversal_prevention(tmp_path: Path):
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    fs = FileSystem(usb_path=usb_dir, managed_folder="Music")
    fs.ensure_managed_folder()

    # Valid relative path
    safe_path = fs.resolve_safe_path("Queen - Bohemian Rhapsody.mp3")
    assert safe_path == fs.managed_root / "Queen - Bohemian Rhapsody.mp3"

    # Traversal attempts
    with pytest.raises(PathTraversalSecurityError):
        fs.resolve_safe_path("../secret.txt")

    with pytest.raises(PathTraversalSecurityError):
        fs.resolve_safe_path("../../Windows/System32/cmd.exe")


def test_filesystem_usb_unavailable_raises(tmp_path: Path):
    non_existent = tmp_path / "does_not_exist"
    fs = FileSystem(usb_path=non_existent, managed_folder="Music")

    with pytest.raises(UsbUnavailableError):
        fs.scan_managed_folder()

    with pytest.raises(UsbUnavailableError):
        fs.ensure_managed_folder()

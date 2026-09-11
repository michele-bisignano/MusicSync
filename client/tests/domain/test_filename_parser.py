"""
Tests for filename parser and path sanitizer.
"""

from music_sync.domain.filename_parser import (
    format_default_relative_path,
    parse_mp3_filename,
    sanitize_filename_part,
)
from music_sync.domain.models import VersionType


def test_sanitize_filename_part():
    assert sanitize_filename_part('Queen: A Night at the Opera?') == "Queen A Night at the Opera"
    assert sanitize_filename_part('Song <with> "illegal" | chars *') == "Song with illegal chars"
    assert sanitize_filename_part("Trailing dots...") == "Trailing dots"
    assert sanitize_filename_part("CON") == "CON_"
    assert sanitize_filename_part("AUX") == "AUX_"
    assert sanitize_filename_part("NUL") == "NUL_"
    assert sanitize_filename_part("") == ""


def test_format_default_relative_path():
    assert format_default_relative_path("Queen", "Bohemian Rhapsody") == "Bohemian Rhapsody - Queen.mp3"
    assert (
        format_default_relative_path("Eagles", "Hotel California", VersionType.ACOUSTIC)
        == "Hotel California - Eagles (Acoustic).mp3"
    )
    assert (
        format_default_relative_path("Bee Gees", "Stayin' Alive (Remix)", VersionType.REMIX)
        == "Stayin' Alive (Remix) - Bee Gees.mp3"
    )


def test_parse_mp3_filename_standard():
    parsed = parse_mp3_filename("Queen - Bohemian Rhapsody.mp3")
    assert parsed.artist == "Queen"
    assert parsed.title == "Bohemian Rhapsody"
    assert parsed.version_type == VersionType.STANDARD
    assert parsed.confidence == "high"


def test_parse_mp3_filename_with_track_number():
    parsed1 = parse_mp3_filename("01 - Queen - Bohemian Rhapsody.mp3")
    assert parsed1.artist == "Queen"
    assert parsed1.title == "Bohemian Rhapsody"

    parsed2 = parse_mp3_filename("05. Don't Stop Me Now - Queen.mp3")
    assert parsed2.artist == "Don't Stop Me Now"
    assert parsed2.title == "Queen"

    parsed3 = parse_mp3_filename("1-02 Radio Ga Ga - Queen.mp3")
    assert parsed3.artist == "Radio Ga Ga"
    assert parsed3.title == "Queen"


def test_parse_mp3_filename_with_version_and_clutter():
    parsed = parse_mp3_filename("Queen - Bohemian Rhapsody (Official Video) (Live).mp3")
    assert parsed.artist == "Queen"
    assert "Bohemian Rhapsody" in parsed.title
    assert parsed.version_type == VersionType.LIVE


def test_parse_mp3_filename_featuring():
    parsed = parse_mp3_filename("David Bowie feat. Queen - Under Pressure.mp3")
    assert "David Bowie" in parsed.artist
    assert "Under Pressure" in parsed.title


def test_parse_mp3_filename_fallback_no_separator():
    parsed = parse_mp3_filename("Bohemian Rhapsody.mp3")
    assert parsed.artist == "Unknown Artist"
    assert parsed.title == "Bohemian Rhapsody"
    assert parsed.confidence == "fallback"

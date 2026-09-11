"""
Tests for domain normalization and version detection.
"""

from music_sync.domain.models import VersionType
from music_sync.domain.normalization import (
    calculate_token_overlap,
    detect_version_type,
    normalize_string,
    strip_video_clutter,
)


def test_normalize_string():
    assert normalize_string(" Queen ") == "queen"
    assert normalize_string("Böhse Onkelz") == "bohse onkelz"
    assert normalize_string("Caffè & Música!!") == "caffe musica"
    assert normalize_string("Don't Stop Me Now") == "don t stop me now"
    assert normalize_string("Song   with    many   spaces") == "song with many spaces"
    assert normalize_string("") == ""


def test_strip_video_clutter():
    assert strip_video_clutter("Song (Official Music Video)") == "Song"
    assert strip_video_clutter("Song [Official Audio]") == "Song"
    assert strip_video_clutter("Song (Lyrics Video)") == "Song"
    assert strip_video_clutter("Song (Videoclip Ufficiale)") == "Song"
    assert strip_video_clutter("Song [HD Remastered]") == "Song"
    assert strip_video_clutter("Song (4K)") == "Song"
    assert strip_video_clutter("Song (Visualizer)") == "Song"
    assert strip_video_clutter("Pure Song Title") == "Pure Song Title"


def test_detect_version_type():
    assert detect_version_type("Hotel California (Acoustic)") == VersionType.ACOUSTIC
    assert detect_version_type("Layla (Unplugged)") == VersionType.ACOUSTIC
    assert detect_version_type("Version Acustica") == VersionType.ACOUSTIC

    assert detect_version_type("Stayin' Alive (Remix)") == VersionType.REMIX
    assert detect_version_type("Song (Club Mix)") == VersionType.REMIX
    assert detect_version_type("Track (Summer VIP Mix)") == VersionType.REMIX

    assert detect_version_type("Hallelujah (Cover)") == VersionType.COVER
    assert detect_version_type("Tribute to Queen") == VersionType.COVER

    assert detect_version_type("Bohemian Rhapsody (Live at Wembley)") == VersionType.LIVE
    assert detect_version_type("Canzone (Dal Vivo)") == VersionType.LIVE
    assert detect_version_type("Concert In Concerto") == VersionType.LIVE

    assert detect_version_type("Just A Normal Song") == VersionType.STANDARD


def test_calculate_token_overlap():
    assert calculate_token_overlap("Queen - Bohemian Rhapsody", "Bohemian Rhapsody - Queen") == 1.0
    assert calculate_token_overlap("Queen - Bohemian Rhapsody", "Queen - Don't Stop Me Now") < 0.5
    assert calculate_token_overlap("Completely Different", "Totally Other") == 0.0
    assert calculate_token_overlap("", "Something") == 0.0

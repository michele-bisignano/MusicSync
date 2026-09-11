"""
Unit tests for SyncPlanner component.
Verifies pure deterministic planning: KEEP, DOWNLOAD, DELETE, IMPORT, WARN_MISSING_SOURCE.
"""

from music_sync.application.planner import SyncPlanner
from music_sync.domain.models import (
    DesiredTrackDto,
    ObsoleteTrackDto,
    PhysicalTrack,
    PlanAction,
    SyncStateSnapshot,
    VersionType,
)
from music_sync.domain.normalization import normalize_string


def test_planner_keep_existing_desired_track():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=42,
        desired_tracks=[
            DesiredTrackDto(
                song_id=1,
                artist="Daft Punk",
                title="Get Lucky",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=12345678901",
                relative_path="Get Lucky - Daft Punk.mp3",
            )
        ],
        obsolete_tracks=[],
    )
    physical_tracks = [
        PhysicalTrack(
            relative_path="Get Lucky - Daft Punk.mp3",
            filename="Get Lucky - Daft Punk.mp3",
            artist="Daft Punk",
            title="Get Lucky",
            normalized_artist="daft punk",
            normalized_title="get lucky",
            version_type=VersionType.STANDARD,
        )
    ]

    plan = planner.create_plan(desired_state, physical_tracks)

    assert plan.sync_version == 42
    assert len(plan.items) == 1
    assert plan.items[0].action == PlanAction.KEEP
    assert plan.items[0].song_id == 1
    assert plan.items[0].relative_path == "Get Lucky - Daft Punk.mp3"
    assert len(plan.to_keep) == 1
    assert len(plan.to_download) == 0
    assert len(plan.to_delete) == 0
    assert len(plan.to_import) == 0
    assert len(plan.warnings) == 0


def test_planner_keep_matched_by_song_identity_different_naming():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=10,
        desired_tracks=[
            DesiredTrackDto(
                song_id=5,
                artist="Queen",
                title="Don't Stop Me Now",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=abcdefghijk",
                relative_path="Don't Stop Me Now - Queen.mp3",
            )
        ],
    )
    # Physical file on USB with alternate convention: 'Queen - Don't Stop Me Now.mp3'
    physical_tracks = [
        PhysicalTrack(
            relative_path="Queen - Don't Stop Me Now.mp3",
            filename="Queen - Don't Stop Me Now.mp3",
            artist="Queen",
            title="Don't Stop Me Now",
            normalized_artist=normalize_string("Queen"),
            normalized_title=normalize_string("Don't Stop Me Now"),
            version_type=VersionType.STANDARD,
        )
    ]

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_keep) == 1
    assert plan.to_keep[0].action == PlanAction.KEEP
    assert plan.to_keep[0].song_id == 5
    assert plan.to_keep[0].relative_path == "Queen - Don't Stop Me Now.mp3"


def test_planner_download_missing_desired_track():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=45,
        desired_tracks=[
            DesiredTrackDto(
                song_id=12,
                artist="Coldplay",
                title="Yellow",
                version_type=VersionType.STANDARD,
                youtube_url="https://youtube.com/watch?v=y1234567890",
                relative_path="Yellow - Coldplay.mp3",
            )
        ],
    )
    physical_tracks = []

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_download) == 1
    assert plan.to_download[0].action == PlanAction.DOWNLOAD
    assert plan.to_download[0].song_id == 12
    assert plan.to_download[0].youtube_url == "https://youtube.com/watch?v=y1234567890"
    assert plan.to_download[0].relative_path == "Yellow - Coldplay.mp3"


def test_planner_warn_missing_source_url():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=50,
        desired_tracks=[
            DesiredTrackDto(
                song_id=99,
                artist="Unknown Artist",
                title="Mysterious Track",
                version_type=VersionType.STANDARD,
                youtube_url=None,  # Imported earlier without youtube_url
                relative_path="Mysterious Track - Unknown Artist.mp3",
            )
        ],
    )
    physical_tracks = []

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_download) == 0
    assert len(plan.warnings) == 1
    assert plan.warnings[0].action == PlanAction.WARN_MISSING_SOURCE
    assert plan.warnings[0].song_id == 99
    assert "no YouTube URL" in plan.warnings[0].reason


def test_planner_delete_obsolete_track():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=60,
        desired_tracks=[],
        obsolete_tracks=[
            ObsoleteTrackDto(
                song_id=7,
                artist="The Beatles",
                title="Yesterday",
                relative_path="Yesterday - The Beatles.mp3",
            )
        ],
    )
    physical_tracks = [
        PhysicalTrack(
            relative_path="Yesterday - The Beatles.mp3",
            filename="Yesterday - The Beatles.mp3",
            artist="The Beatles",
            title="Yesterday",
            normalized_artist="the beatles",
            normalized_title="yesterday",
            version_type=VersionType.STANDARD,
        )
    ]

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_delete) == 1
    assert plan.to_delete[0].action == PlanAction.DELETE
    assert plan.to_delete[0].song_id == 7
    assert plan.to_delete[0].relative_path == "Yesterday - The Beatles.mp3"


def test_planner_obsolete_track_not_on_usb_is_ignored():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=60,
        desired_tracks=[],
        obsolete_tracks=[
            ObsoleteTrackDto(
                song_id=7,
                artist="The Beatles",
                title="Yesterday",
                relative_path="Yesterday - The Beatles.mp3",
            )
        ],
    )
    physical_tracks = []  # Already absent on USB

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_delete) == 0
    assert len(plan.items) == 0
    assert plan.is_empty


def test_planner_import_uncataloged_physical_file():
    planner = SyncPlanner()
    desired_state = SyncStateSnapshot(
        sync_version=70,
        desired_tracks=[],
        obsolete_tracks=[],
    )
    physical_tracks = [
        PhysicalTrack(
            relative_path="Manual Song - Artist.mp3",
            filename="Manual Song - Artist.mp3",
            artist="Artist",
            title="Manual Song",
            normalized_artist="artist",
            normalized_title="manual song",
            version_type=VersionType.STANDARD,
        )
    ]

    plan = planner.create_plan(desired_state, physical_tracks)

    assert len(plan.to_import) == 1
    assert plan.to_import[0].action == PlanAction.IMPORT
    assert plan.to_import[0].artist == "Artist"
    assert plan.to_import[0].title == "Manual Song"
    assert plan.to_import[0].relative_path == "Manual Song - Artist.mp3"

"""
Tests for BackendClient HTTP operations and error translation.
"""

from unittest.mock import MagicMock, patch
import pytest
import requests

from music_sync.domain.models import VersionType
from music_sync.infrastructure.backend_client import (
    BackendAuthenticationError,
    BackendClient,
    BackendConflictError,
    BackendConnectionError,
    BackendServerError,
    BackendValidationError,
)


@pytest.fixture
def client():
    return BackendClient(
        backend_url="https://api.musicsync.example",
        sync_token="secret-sync-token",
        timeout=10,
    )


def test_get_health_success(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"status": "healthy"}'
    mock_resp.json.return_value = {"status": "healthy"}

    with patch("requests.get", return_value=mock_resp) as mock_get:
        result = client.get_health()
        assert result == {"status": "healthy"}
        mock_get.assert_called_once_with(
            "https://api.musicsync.example/api/v1/health",
            headers={
                "Authorization": "Bearer secret-sync-token",
                "Content-Type": "application/json",
                "User-Agent": "MusicSync-Client/0.1.0",
            },
            timeout=10,
        )


def test_get_sync_state_success(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"sync_version": 5, "desired_tracks": [{"song_id": 1, "artist": "Queen", "title": "Radio Ga Ga", "version_type": "standard", "youtube_url": "https://youtu.be/xxx", "relative_path": "Radio Ga Ga - Queen.mp3"}], "obsolete_tracks": []}'
    mock_resp.json.return_value = {
        "sync_version": 5,
        "desired_tracks": [
            {
                "song_id": 1,
                "artist": "Queen",
                "title": "Radio Ga Ga",
                "version_type": "standard",
                "youtube_url": "https://youtu.be/xxx",
                "relative_path": "Radio Ga Ga - Queen.mp3",
            }
        ],
        "obsolete_tracks": [],
    }

    with patch("requests.get", return_value=mock_resp):
        state = client.get_sync_state()
        assert state.sync_version == 5
        assert len(state.desired_tracks) == 1
        assert state.desired_tracks[0].song_id == 1
        assert state.desired_tracks[0].artist == "Queen"
        assert state.desired_tracks[0].version_type == VersionType.STANDARD
        assert state.desired_tracks[0].relative_path == "Radio Ga Ga - Queen.mp3"


def test_post_sync_report_success(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"acknowledged": true, "sync_version": 6, "summary": {"songs_imported": 2, "tracks_confirmed": 0, "tracks_removed": 0}}'
    mock_resp.json.return_value = {
        "acknowledged": True,
        "sync_version": 6,
        "summary": {"songs_imported": 2, "tracks_confirmed": 0, "tracks_removed": 0},
    }

    payload = {
        "sync_version": 5,
        "status": "success",
        "operations": [],
    }

    with patch("requests.post", return_value=mock_resp) as mock_post:
        result = client.post_sync_report(payload)
        assert result["acknowledged"] is True
        assert result["sync_version"] == 6
        assert result["summary"]["songs_imported"] == 2
        mock_post.assert_called_once_with(
            "https://api.musicsync.example/api/v1/sync/report",
            json=payload,
            headers={
                "Authorization": "Bearer secret-sync-token",
                "Content-Type": "application/json",
                "User-Agent": "MusicSync-Client/0.1.0",
            },
            timeout=10,
        )


def test_post_sync_report_authentication_error(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = '{"error": {"code": "UNAUTHORIZED", "message": "Invalid sync token"}}'
    mock_resp.json.return_value = {"error": {"code": "UNAUTHORIZED", "message": "Invalid sync token"}}

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(BackendAuthenticationError) as exc_info:
            client.post_sync_report({"sync_version": 1, "status": "success", "operations": []})
        assert "Invalid sync token" in str(exc_info.value)
        assert exc_info.value.status_code == 401


def test_post_sync_report_conflict_error(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 409
    mock_resp.text = '{"error": {"code": "VERSION_CONFLICT", "message": "Version mismatch"}}'
    mock_resp.json.return_value = {"error": {"code": "VERSION_CONFLICT", "message": "Version mismatch"}}

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(BackendConflictError) as exc_info:
            client.post_sync_report({"sync_version": 10, "status": "success", "operations": []})
        assert "Version mismatch" in str(exc_info.value)


def test_post_sync_report_validation_error(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = '{"error": {"code": "INVALID_PAYLOAD", "message": "Missing sync_version"}}'
    mock_resp.json.return_value = {"error": {"code": "INVALID_PAYLOAD", "message": "Missing sync_version"}}

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(BackendValidationError) as exc_info:
            client.post_sync_report({})
        assert "Missing sync_version" in str(exc_info.value)


def test_post_sync_report_server_error(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = '{"error": {"code": "INTERNAL_ERROR", "message": "Database crashed"}}'
    mock_resp.json.return_value = {"error": {"code": "INTERNAL_ERROR", "message": "Database crashed"}}

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(BackendServerError) as exc_info:
            client.post_sync_report({"sync_version": 1, "status": "success", "operations": []})
        assert exc_info.value.status_code == 500


def test_connection_error(client):
    with patch("requests.get", side_effect=requests.ConnectionError("Failed to resolve host")):
        with pytest.raises(BackendConnectionError) as exc_info:
            client.get_sync_state()
        assert "Failed to fetch sync state" in str(exc_info.value)

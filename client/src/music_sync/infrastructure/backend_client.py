"""
Backend API HTTP Client.
Communicates with the Cloudflare Worker backend over HTTPS.
Handles authentication using Authorization: Bearer <SYNC_TOKEN> and error translation.
"""

from typing import Any, Dict, Optional
import requests

from ..domain.models import (
    DesiredTrackDto,
    ObsoleteTrackDto,
    SyncStateSnapshot,
    VersionType,
    parse_version_type,
)


class BackendClientError(Exception):
    """Base exception for Backend API client errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}


class BackendConnectionError(BackendClientError):
    """Raised when the backend server cannot be reached."""
    pass


class BackendAuthenticationError(BackendClientError):
    """Raised when authentication fails (HTTP 401 Unauthorized)."""
    pass


class BackendValidationError(BackendClientError):
    """Raised when the backend rejects the request as invalid (HTTP 400)."""
    pass


class BackendConflictError(BackendClientError):
    """Raised when there is a version or state conflict (HTTP 409)."""
    pass


class BackendServerError(BackendClientError):
    """Raised when the backend encounters an internal error (HTTP 500/503)."""
    pass


class BackendClient:
    """
    HTTP client for the MusicSync synchronization backend API.
    """

    def __init__(self, backend_url: str, sync_token: str, timeout: int = 30):
        self.backend_url = backend_url.rstrip("/")
        self.sync_token = sync_token.strip()
        self.timeout = timeout

        if not self.backend_url:
            raise ValueError("backend_url must not be empty")
        if not self.sync_token:
            raise ValueError("sync_token must not be empty")

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.sync_token}",
            "Content-Type": "application/json",
            "User-Agent": "MusicSync-Client/0.1.0",
        }

    def get_health(self) -> Dict[str, Any]:
        """Calls GET /api/v1/health to verify service status."""
        url = f"{self.backend_url}/api/v1/health"
        try:
            response = requests.get(url, headers=self._headers, timeout=self.timeout)
            return self._handle_response(response)
        except requests.RequestException as e:
            raise BackendConnectionError(f"Failed to connect to backend at {url}: {e}") from e

    def get_sync_state(self) -> SyncStateSnapshot:
        """
        Calls GET /api/v1/sync/state.
        Returns a snapshot of desired and obsolete tracks.
        """
        url = f"{self.backend_url}/api/v1/sync/state"
        try:
            response = requests.get(url, headers=self._headers, timeout=self.timeout)
            data = self._handle_response(response)
        except requests.RequestException as e:
            raise BackendConnectionError(f"Failed to fetch sync state from {url}: {e}") from e

        desired_tracks = [
            DesiredTrackDto(
                song_id=int(item["song_id"]),
                artist=str(item["artist"]),
                title=str(item["title"]),
                version_type=parse_version_type(item.get("version_type")),
                youtube_url=item.get("youtube_url"),
                relative_path=str(item["relative_path"]),
            )
            for item in data.get("desired_tracks", [])
        ]

        obsolete_tracks = [
            ObsoleteTrackDto(
                song_id=int(item["song_id"]),
                artist=str(item["artist"]),
                title=str(item["title"]),
                relative_path=str(item["relative_path"]),
            )
            for item in data.get("obsolete_tracks", [])
        ]

        return SyncStateSnapshot(
            sync_version=int(data.get("sync_version", 0)),
            desired_tracks=desired_tracks,
            obsolete_tracks=obsolete_tracks,
        )

    def post_sync_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calls POST /api/v1/sync/report.
        Submits physical synchronisation results or USB import operations.
        """
        url = f"{self.backend_url}/api/v1/sync/report"
        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._headers,
                timeout=self.timeout,
            )
            return self._handle_response(response)
        except requests.RequestException as e:
            raise BackendConnectionError(f"Failed to send sync report to {url}: {e}") from e

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """Translates HTTP responses and error codes into structured domain exceptions."""
        try:
            data = response.json() if response.text.strip() else {}
        except Exception:
            data = {"raw_text": response.text}

        if 200 <= response.status_code < 300:
            return data

        error_message = (
            data.get("error", {}).get("message")
            if isinstance(data.get("error"), dict)
            else data.get("message", f"HTTP {response.status_code} error")
        )
        error_code = (
            data.get("error", {}).get("code")
            if isinstance(data.get("error"), dict)
            else "API_ERROR"
        )
        details = data.get("error", {}).get("details", {}) if isinstance(data.get("error"), dict) else {}

        if response.status_code == 401:
            raise BackendAuthenticationError(
                f"Authentication failed: {error_message}",
                status_code=401,
                details=details,
            )
        elif response.status_code == 400:
            raise BackendValidationError(
                f"Validation error: {error_message}",
                status_code=400,
                details=details,
            )
        elif response.status_code == 409:
            raise BackendConflictError(
                f"Conflict ({error_code}): {error_message}",
                status_code=409,
                details=details,
            )
        elif response.status_code in (500, 502, 503, 504):
            raise BackendServerError(
                f"Backend server error ({response.status_code}): {error_message}",
                status_code=response.status_code,
                details=details,
            )
        else:
            raise BackendClientError(
                f"API error ({response.status_code}): {error_message}",
                status_code=response.status_code,
                details=details,
            )

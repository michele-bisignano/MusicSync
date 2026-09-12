"""
Configuration management for MusicSync client.
Loads configuration from TOML files, environment variables, and CLI overrides with strict priority.
"""

from dataclasses import dataclass
import os
from pathlib import Path
import sys
from typing import Any, Dict, Optional

# Load TOML support depending on Python version
if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None  # type: ignore


@dataclass
class ClientConfig:
    backend_url: str
    sync_token: str
    usb_path: str
    managed_folder: str = "Music"
    timeout: int = 30
    download_delay_min: float = 2.0
    download_delay_max: float = 4.0
    rate_limit_backoff: float = 30.0
    max_retries_per_track: int = 2


class ConfigurationError(Exception):
    """Raised when configuration values are missing or invalid."""
    pass


def _find_default_config_file() -> Optional[Path]:
    """Looks for config.local.toml or config.toml in current, executable, and parent directories."""
    search_dirs = [
        Path.cwd(),
        Path(sys.executable).parent,
        Path.cwd() / "client",
        Path(__file__).resolve().parent.parent.parent,
    ]

    candidate_names = ["config.local.toml", "config.toml"]

    for directory in search_dirs:
        for name in candidate_names:
            file_path = directory / name
            if file_path.is_file():
                return file_path
    return None


def _load_toml(file_path: Path) -> Dict[str, Any]:
    """Reads a TOML file into a dictionary."""
    if tomllib is None:
        return {}
    try:
        with open(file_path, "rb") as f:
            return tomllib.load(f)
    except Exception as e:
        raise ConfigurationError(f"Failed to parse config file '{file_path}': {e}") from e


def load_config(
    config_path: Optional[str | Path] = None,
    cli_overrides: Optional[Dict[str, Any]] = None,
    require_backend: bool = True,
) -> ClientConfig:
    """
    Loads configuration with the following priority (highest to lowest):
    1. CLI overrides
    2. Environment variables
    3. TOML configuration file
    4. Default values
    """
    overrides = cli_overrides or {}
    toml_data: Dict[str, Any] = {}

    # 1. Load from file if specified or found
    if config_path:
        path = Path(config_path).resolve()
        if not path.is_file():
            raise ConfigurationError(f"Specified config file not found: {path}")
        toml_data = _load_toml(path)
    else:
        default_file = _find_default_config_file()
        if default_file:
            toml_data = _load_toml(default_file)

    # 2. Extract values with fallback precedence
    backend_url = (
        overrides.get("backend_url")
        or os.environ.get("MUSICSYNC_BACKEND_URL")
        or os.environ.get("BACKEND_URL")
        or toml_data.get("backend_url", "")
    )

    sync_token = (
        overrides.get("sync_token")
        or os.environ.get("MUSICSYNC_SYNC_TOKEN")
        or os.environ.get("SYNC_TOKEN")
        or toml_data.get("sync_token", "")
    )

    usb_path = (
        overrides.get("usb_path")
        or os.environ.get("MUSICSYNC_USB_PATH")
        or os.environ.get("USB_PATH")
        or toml_data.get("usb_path", "")
    )

    managed_folder = (
        overrides.get("managed_folder")
        or os.environ.get("MUSICSYNC_MANAGED_FOLDER")
        or os.environ.get("MANAGED_FOLDER")
        or toml_data.get("managed_folder", "Music")
    )

    timeout = int(
        overrides.get("timeout")
        or os.environ.get("MUSICSYNC_TIMEOUT")
        or toml_data.get("timeout", 30)
    )

    download_delay_min = float(
        overrides.get("download_delay_min")
        or os.environ.get("MUSICSYNC_DOWNLOAD_DELAY_MIN")
        or toml_data.get("download_delay_min", 2.0)
    )

    download_delay_max = float(
        overrides.get("download_delay_max")
        or os.environ.get("MUSICSYNC_DOWNLOAD_DELAY_MAX")
        or toml_data.get("download_delay_max", 4.0)
    )

    rate_limit_backoff = float(
        overrides.get("rate_limit_backoff")
        or os.environ.get("MUSICSYNC_RATE_LIMIT_BACKOFF")
        or toml_data.get("rate_limit_backoff", 30.0)
    )

    max_retries_per_track = int(
        overrides.get("max_retries_per_track")
        or os.environ.get("MUSICSYNC_MAX_RETRIES_PER_TRACK")
        or toml_data.get("max_retries_per_track", 2)
    )

    # 3. Validate required fields
    if not usb_path:
        raise ConfigurationError(
            "Missing 'usb_path'. Provide it via --usb-path, config.toml, or USB_PATH env variable."
        )

    if require_backend:
        if not backend_url:
            raise ConfigurationError(
                "Missing 'backend_url'. Provide it via --backend-url, config.toml, or BACKEND_URL env variable."
            )
        if not sync_token:
            raise ConfigurationError(
                "Missing 'sync_token'. Provide it via --sync-token, config.toml, or SYNC_TOKEN env variable."
            )

    return ClientConfig(
        backend_url=str(backend_url).rstrip("/"),
        sync_token=str(sync_token).strip(),
        usb_path=str(usb_path),
        managed_folder=str(managed_folder).strip(),
        timeout=timeout,
        download_delay_min=download_delay_min,
        download_delay_max=download_delay_max,
        rate_limit_backoff=rate_limit_backoff,
        max_retries_per_track=max_retries_per_track,
    )

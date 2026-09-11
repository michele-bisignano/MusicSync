"""
MusicSync Infrastructure Package
"""

from .filesystem import (
    FileSystem,
    FileSystemError,
    PathTraversalSecurityError,
    UsbUnavailableError,
)
from .backend_client import (
    BackendAuthenticationError,
    BackendClient,
    BackendClientError,
    BackendConflictError,
    BackendConnectionError,
    BackendServerError,
    BackendValidationError,
)

__all__ = [
    "FileSystem",
    "FileSystemError",
    "PathTraversalSecurityError",
    "UsbUnavailableError",
    "BackendAuthenticationError",
    "BackendClient",
    "BackendClientError",
    "BackendConflictError",
    "BackendConnectionError",
    "BackendServerError",
    "BackendValidationError",
]

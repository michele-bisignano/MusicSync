"""
MusicSync CLI Package
"""

from .parser import create_cli_parser
from .main import main, run_cli

__all__ = ["create_cli_parser", "main", "run_cli"]

"""
Entrypoint for `python -m music_sync` and PyInstaller build.
"""

import sys
from pathlib import Path

if not __package__:
    # When run directly or via PyInstaller, ensure 'src' is on sys.path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from music_sync.cli.main import main
else:
    from .cli.main import main

if __name__ == "__main__":
    main()


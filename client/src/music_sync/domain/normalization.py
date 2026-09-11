"""
Domain normalization utilities.
Matches the TypeScript backend normalization logic to ensure 100% parity
for duplicate detection and song identity reconciliation.
"""

import re
import unicodedata
from .models import VersionType

# Presentation clutter commonly found in titles
CLUTTER_PATTERNS = [
    re.compile(r"\((?:official\s+)?(?:music\s+)?video\)", re.IGNORECASE),
    re.compile(r"\[(?:official\s+)?(?:music\s+)?video\]", re.IGNORECASE),
    re.compile(r"\((?:official\s+)?audio\)", re.IGNORECASE),
    re.compile(r"\[(?:official\s+)?audio\]", re.IGNORECASE),
    re.compile(r"\((?:official\s+)?lyric(?:s)?(?:\s+video)?\)", re.IGNORECASE),
    re.compile(r"\[(?:official\s+)?lyric(?:s)?(?:\s+video)?\]", re.IGNORECASE),
    re.compile(r"\(videoclip\s+ufficiale\)", re.IGNORECASE),
    re.compile(r"\[videoclip\s+ufficiale\]", re.IGNORECASE),
    re.compile(r"\((?:hd|4k|hq|remastered|visualizer|hd\s+remastered|4k\s+remastered)\)", re.IGNORECASE),
    re.compile(r"\[(?:hd|4k|hq|remastered|visualizer|hd\s+remastered|4k\s+remastered)\]", re.IGNORECASE),
    re.compile(r"\b(?:official\s+video|official\s+music\s+video|official\s+audio|lyric\s+video)\b", re.IGNORECASE),
    re.compile(r"\b(?:video\s+ufficiale|testo)\b", re.IGNORECASE),
]


def normalize_string(text: str) -> str:
    """
    Normalizes a string by:
    - Stripping diacritics/accents (NFD normalization)
    - Converting to lowercase
    - Replacing non-alphanumeric characters with spaces
    - Collapsing consecutive spaces into a single space
    - Trimming leading/trailing whitespace
    """
    if not text:
        return ""

    # NFD normalization + strip diacritic combining characters
    nfd = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")
    lower = stripped.lower()
    alphanumeric = re.sub(r"[^a-z0-9\s]", " ", lower)
    collapsed = re.sub(r"\s+", " ", alphanumeric)
    return collapsed.strip()


def strip_video_clutter(title: str) -> str:
    """
    Strips presentation clutter (like "Official Video", "Lyrics") from a title
    while preserving version markers.
    """
    if not title:
        return ""

    cleaned = title
    for pattern in CLUTTER_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)

    return re.sub(r"\s+", " ", cleaned).strip()


def detect_version_type(text: str) -> VersionType:
    """
    Detects version type from a title or raw query.
    Distinguishes: standard, cover, remix, acoustic, live.
    """
    if not text:
        return VersionType.STANDARD

    lower = text.lower()

    # Acoustic / Unplugged
    if re.search(r"\b(?:acoustic|acustica|acustico|unplugged)\b", lower, re.IGNORECASE):
        return VersionType.ACOUSTIC

    # Remix / Club Mix / VIP
    if (
        re.search(r"\b(?:remix|club\s+mix|extended\s+mix|vip\s+mix|original\s+mix|summer\s+mix|dance\s+mix|dub\s+mix|radio\s+mix)\b", lower, re.IGNORECASE)
        or re.search(r"[([][^\])]*\bmix\b[^\])]*[)\]]", lower, re.IGNORECASE)
    ):
        return VersionType.REMIX

    # Cover / Tribute
    if re.search(r"\b(?:cover|tribute|suonata\s+da)\b", lower, re.IGNORECASE):
        return VersionType.COVER

    # Live / Dal Vivo / In Concerto
    if re.search(r"\b(?:live|dal\s+vivo|in\s+concerto|live\s+at|at\s+wembley)\b", lower, re.IGNORECASE):
        return VersionType.LIVE

    return VersionType.STANDARD


def calculate_token_overlap(a: str, b: str) -> float:
    """
    Calculates Jaccard token overlap similarity between two strings.
    Returns float in range [0.0, 1.0].
    """
    tokens_a = set(t for t in normalize_string(a).split(" ") if t)
    tokens_b = set(t for t in normalize_string(b).split(" ") if t)

    if not tokens_a or not tokens_b:
        return 0.0

    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)

    return intersection / union if union > 0 else 0.0

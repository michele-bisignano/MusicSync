"""
SyncPlanner application component.
Compares remote DesiredState with local PhysicalState from USB drive.
Produces a deterministic SyncPlan (KEEP, DOWNLOAD, DELETE, IMPORT, WARN_MISSING_SOURCE)
without performing any network or filesystem I/O.
"""

from typing import Dict, List, Set

from ..domain.models import (
    DesiredTrackDto,
    ObsoleteTrackDto,
    PhysicalTrack,
    PlanAction,
    SongIdentity,
    SyncPlan,
    SyncPlanItem,
    SyncStateSnapshot,
    VersionType,
)
from ..domain.normalization import normalize_string


class SyncPlanner:
    """
    Pure planning component that reconciles desired library state against physical tracks.
    """

    def create_plan(
        self,
        desired_state: SyncStateSnapshot,
        physical_tracks: List[PhysicalTrack],
    ) -> SyncPlan:
        """
        Creates a deterministic SyncPlan by comparing remote desired state with physical tracks.
        """
        items: List[SyncPlanItem] = []

        # Index physical tracks by relative_path and identity
        physical_by_path: Dict[str, PhysicalTrack] = {
            t.relative_path.lower(): t for t in physical_tracks
        }
        physical_by_identity: Dict[SongIdentity, List[PhysicalTrack]] = {}
        for t in physical_tracks:
            physical_by_identity.setdefault(t.identity, []).append(t)

        matched_physical_paths: Set[str] = set()

        # 1. Reconcile Desired Tracks
        for desired in desired_state.desired_tracks:
            desired_path_key = desired.relative_path.lower()
            desired_identity = SongIdentity(
                normalized_artist=normalize_string(desired.artist),
                normalized_title=normalize_string(desired.title),
                version_type=desired.version_type,
            )

            matched_track: PhysicalTrack | None = None

            # First, try matching by exact relative path
            if (
                desired_path_key in physical_by_path
                and desired_path_key not in matched_physical_paths
            ):
                matched_track = physical_by_path[desired_path_key]
            # Second, try matching by SongIdentity
            elif desired_identity in physical_by_identity:
                candidates = [
                    t
                    for t in physical_by_identity[desired_identity]
                    if t.relative_path.lower() not in matched_physical_paths
                ]
                if candidates:
                    matched_track = candidates[0]

            if matched_track is not None:
                matched_physical_paths.add(matched_track.relative_path.lower())
                items.append(
                    SyncPlanItem(
                        action=PlanAction.KEEP,
                        relative_path=matched_track.relative_path,
                        artist=desired.artist,
                        title=desired.title,
                        version_type=desired.version_type,
                        youtube_url=desired.youtube_url,
                        song_id=desired.song_id,
                        reason="Already exists physically on USB drive",
                    )
                )
            else:
                # Track is missing physically from USB
                if desired.youtube_url and desired.youtube_url.strip():
                    items.append(
                        SyncPlanItem(
                            action=PlanAction.DOWNLOAD,
                            relative_path=desired.relative_path,
                            artist=desired.artist,
                            title=desired.title,
                            version_type=desired.version_type,
                            youtube_url=desired.youtube_url.strip(),
                            song_id=desired.song_id,
                            reason="Desired track missing on USB; ready to download",
                        )
                    )
                else:
                    items.append(
                        SyncPlanItem(
                            action=PlanAction.WARN_MISSING_SOURCE,
                            relative_path=desired.relative_path,
                            artist=desired.artist,
                            title=desired.title,
                            version_type=desired.version_type,
                            youtube_url=None,
                            song_id=desired.song_id,
                            reason="Missing physical file and no YouTube URL configured for download",
                        )
                    )

        # 2. Reconcile Obsolete Tracks (Tracks marked as removed in the database)
        for obsolete in desired_state.obsolete_tracks:
            obsolete_path_key = obsolete.relative_path.lower()
            if (
                obsolete_path_key in physical_by_path
                and obsolete_path_key not in matched_physical_paths
            ):
                matched_physical_paths.add(obsolete_path_key)
                items.append(
                    SyncPlanItem(
                        action=PlanAction.DELETE,
                        relative_path=obsolete.relative_path,
                        artist=obsolete.artist,
                        title=obsolete.title,
                        version_type=VersionType.STANDARD,
                        song_id=obsolete.song_id,
                        reason="Soft-deleted from library; scheduled for physical removal",
                    )
                )

        # 3. Detect Uncataloged Physical Files on USB (Manual Additions / New Files)
        for phys in physical_tracks:
            if phys.relative_path.lower() not in matched_physical_paths:
                matched_physical_paths.add(phys.relative_path.lower())
                items.append(
                    SyncPlanItem(
                        action=PlanAction.IMPORT,
                        relative_path=phys.relative_path,
                        artist=phys.artist,
                        title=phys.title,
                        version_type=phys.version_type,
                        youtube_url=None,
                        song_id=None,
                        reason="Uncataloged file discovered on USB; scheduled for database import",
                    )
                )

        return SyncPlan(
            sync_version=desired_state.sync_version,
            items=items,
        )

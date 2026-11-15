"""Export every blender/source/**/*.blend to public/models/<same relative path>.glb.

Each asset declares its export profile; an armature alone never decides it:
  * a .blend under `characters/` exports with export_glb's skinned profile (the character
    contract), and anything else with the static profile;
  * the scene custom property `export_profile` ("static" or "skinned") overrides that;
  * the scene custom property `export_clips` (comma-separated, e.g. "idle,walk,wave")
    sets the clips a skinned export must carry exactly (default: CHARACTER_CLIPS).
Every .blend is attempted. Failures are listed at the end and the run exits non-zero.

Run: pnpm assets:export
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from lib.gltf import CHARACTER_CLIPS, export_glb  # noqa: E402
from lib.paths import MODELS_DIR, SOURCE_DIR  # noqa: E402

CHARACTERS_DIR = "characters"


def declared_export(rel: Path, scene) -> tuple[str, tuple[str, ...]]:
    """The (profile, clips) a .blend at `rel` (relative to the source dir) declares."""
    profile = scene.get("export_profile")
    if profile is None:
        profile = "skinned" if rel.parts[0] == CHARACTERS_DIR else "static"
    clips = scene.get("export_clips")
    clips = tuple(c.strip() for c in clips.split(",")) if clips else CHARACTER_CLIPS
    return str(profile), clips


def export_all(source_dir: Path = SOURCE_DIR, models_dir: Path = MODELS_DIR) -> list[str]:
    """Export every .blend under source_dir; return one "<rel path>: <error>" per failure."""
    failures = []
    blends = sorted(source_dir.rglob("*.blend"))
    if not blends:
        print(f"[export] no .blend files in {source_dir}")
    for blend in blends:
        rel = blend.relative_to(source_dir)
        try:
            bpy.ops.wm.open_mainfile(filepath=str(blend))
            profile, clips = declared_export(rel, bpy.context.scene)
            export_glb(models_dir / rel.with_suffix(".glb"), profile=profile, clips=clips)
        except Exception as err:  # noqa: BLE001 - report it and carry on with the rest
            traceback.print_exc()
            failures.append(f"{rel.as_posix()}: {err}")
    for f in failures:
        print(f"[export] FAILED {f}")
    return failures


if __name__ == "__main__":
    if export_all():
        sys.exit(1)

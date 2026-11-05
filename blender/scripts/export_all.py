"""Export every blender/source/**/*.blend to public/models/<same relative path>.glb.

Run: pnpm assets:export
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.paths import MODELS_DIR, SOURCE_DIR  # noqa: E402


def main() -> None:
    blends = sorted(SOURCE_DIR.rglob("*.blend"))
    if not blends:
        print(f"[export] no .blend files in {SOURCE_DIR}")
        return
    for blend in blends:
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        export_glb(MODELS_DIR / blend.relative_to(SOURCE_DIR).with_suffix(".glb"))


main()

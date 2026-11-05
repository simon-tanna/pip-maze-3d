"""glTF export settings, kept in one place so hand-made and generated assets export identically."""

from pathlib import Path

import bpy


def export_glb(out_path: Path) -> None:
    """Export the current scene to a .glb that three.js GLTFLoader can read directly.

    Conventions (see CLAUDE.md "Blender conventions"):
      * 1 Blender unit = 1 metre = 1 three.js unit.
      * Blender is Z-up; export_yup converts to three.js Y-up.
      * Modifiers are applied; objects/collections prefixed with "_" are skipped (helpers, cutters).
    """
    for obj in bpy.data.objects:
        if obj.name.startswith("_"):
            obj.hide_set(True)
            obj.hide_render = True

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        use_visible=True,
        export_animations=True,
        export_extras=True,  # custom properties → userData (e.g. hazard type tags)
    )
    print(f"[export] {out_path}")

"""export_all takes each .blend's profile from the asset, and reports every failure.

Builds a throwaway source tree of .blend files and runs export_all over it:
  * characters/pip.blend: Pip, under characters/, so the skinned profile → exports.
  * characters/broken.blend: no armature, so the character contract fails.
  * characters/runner.blend: Pip with clips idle/run, declared by the scene's
    `export_clips` property → exports.
  * props/lever.blend: a rigged prop outside characters/ → the static profile, so its
    unanimated armature and off-palette material pass.
  * props/winch.blend: `export_profile = "skinned"` on the scene opts a prop in → fails.
The two failures must both be reported (the loop doesn't stop at the first), and every
other file must still export. Exits non-zero on any failure.

Run: pnpm assets:test
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from build_pip import build, reset_scene  # noqa: E402
from export_all import export_all  # noqa: E402


def save(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


def rigged_prop() -> None:
    reset_scene()
    bpy.ops.mesh.primitive_cube_add()
    bpy.context.active_object.data.materials.append(bpy.data.materials.new("Material"))
    bpy.ops.object.armature_add()


def main() -> None:
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "src", Path(tmp) / "models"

        build()
        save(src / "characters" / "pip.blend")

        reset_scene()
        bpy.ops.mesh.primitive_cube_add()
        save(src / "characters" / "broken.blend")

        build()
        bpy.data.actions["walk"].name = "run"
        bpy.context.scene["export_clips"] = "idle,run"
        save(src / "characters" / "runner.blend")

        rigged_prop()
        save(src / "props" / "lever.blend")

        rigged_prop()
        bpy.context.scene["export_profile"] = "skinned"
        save(src / "props" / "winch.blend")

        reported = export_all(src, out)
        failed = sorted(Path(r.split(":")[0]).as_posix() for r in reported)
        if failed != ["characters/broken.blend", "props/winch.blend"]:
            failures.append(f"expected broken + winch to fail, got {reported}")
        for ok in ("characters/pip.glb", "characters/runner.glb", "props/lever.glb"):
            if not (out / ok).exists():
                failures.append(f"{ok} was not exported")
        for bad in ("characters/broken.glb", "props/winch.glb"):
            if (out / bad).exists():
                failures.append(f"{bad} was written despite failing")

    for f in failures:
        print(f"[FAIL] {f}")
    if failures:
        sys.exit(1)
    print("[test] export_all passed")


if __name__ == "__main__":
    main()

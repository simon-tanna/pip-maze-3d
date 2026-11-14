"""The skinned export profile fails loudly on every character-contract violation.

Each case builds Pip (build_pip.build), breaks one rule, and expects export_glb(...,
profile="skinned") to raise ExportContractError without writing a file. The unbroken
build must export. Exits non-zero on any failure.

Run: pnpm assets:test
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from build_pip import build  # noqa: E402
from lib.gltf import ExportContractError, export_glb  # noqa: E402


def second_armature(arm, mesh):
    extra = bpy.data.objects.new("prop_rig", bpy.data.armatures.new("prop_rig"))
    bpy.context.scene.collection.objects.link(extra)


def hidden_rig(arm, mesh):
    arm.hide_set(True)


def no_animation_data(arm, mesh):
    arm.animation_data_clear()


def no_fake_user(arm, mesh):
    bpy.data.actions["walk"].use_fake_user = False


def unexpected_clip(arm, mesh):
    act = bpy.data.actions.new("wave")
    act.use_fake_user = True


def missing_clip(arm, mesh):
    bpy.data.actions.remove(bpy.data.actions["walk"])


def renamed_clip(arm, mesh):
    bpy.data.actions["walk"].name = "Walk"


def off_palette_material(arm, mesh):
    mesh.material_slots[0].material = bpy.data.materials.new("Material.001")


BROKEN = [
    second_armature,
    hidden_rig,
    no_animation_data,
    no_fake_user,
    unexpected_clip,
    missing_clip,
    renamed_clip,
    off_palette_material,
]


def main() -> None:
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, breaker in enumerate(BROKEN):
            out = Path(tmp) / f"broken_{i}.glb"
            build_result = build()
            breaker(*build_result)
            try:
                export_glb(out, profile="skinned")
            except ExportContractError as err:
                if out.exists():
                    failures.append(f"{breaker.__name__}: raised but wrote {out.name}")
                else:
                    print(f"[ok] {breaker.__name__}: {err}")
                continue
            failures.append(f"{breaker.__name__}: exported without complaint")

        out = Path(tmp) / "pip.glb"
        build()
        try:
            export_glb(out, profile="skinned")
            print("[ok] the unbroken build exports")
        except ExportContractError as err:
            failures.append(f"unbroken build: {err}")

    for f in failures:
        print(f"[FAIL] {f}")
    if failures:
        sys.exit(1)
    print(f"[test] {len(BROKEN) + 1} cases passed")


if __name__ == "__main__":
    main()

"""Build Pip v1, a primitive blockout of docs/art/pip-concept.png, and export it skinned.

The character contract (3d-slice ticket 06, m1 ticket 10):
  * faces Blender -Y (three +Z, south), origin between the feet at Z = 0, 1.5 m tall,
    footprint inside 1.2 m; big head, and the hat crown and brim are the silhouette;
  * one armature of 13 snake_case bones (BONES below), every part rigidly weighted to one
    bone (one influence per vertex);
  * actions `idle` (breathing) and `walk` (one full cycle, two footfalls, bob and squash),
    each with a fake user; code adds no procedural squash, the clips own the feel;
  * material slots named after HERO_* palette keys (export_glb rewrites Base Color from
    palette.json).

Ticket 11 (the fidelity pass) builds on BONES and the slot names; keep them stable.
Run: pnpm assets:build (every builder) -> public/models/characters/pip.glb
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "characters" / "pip.glb"
FPS = 24
BONE_LENGTH = 0.08  # every bone points up (+Z) from its pivot, so local X is world X

# name: (pivot head in Blender space, parent)
BONES: dict[str, tuple[tuple[float, float, float], str | None]] = {
    "root": ((0.0, 0.0, 0.0), None),
    "hips": ((0.0, 0.0, 0.30), "root"),
    "spine": ((0.0, 0.0, 0.52), "hips"),
    "head": ((0.0, 0.0, 0.80), "spine"),
    "hat": ((0.0, 0.0, 1.16), "head"),
    "arm_L": ((0.33, 0.0, 0.76), "spine"),
    "hand_L": ((0.37, 0.0, 0.50), "arm_L"),
    "arm_R": ((-0.33, 0.0, 0.76), "spine"),
    "hand_R": ((-0.37, 0.0, 0.50), "arm_R"),
    "leg_L": ((0.12, 0.0, 0.30), "root"),
    "foot_L": ((0.12, 0.0, 0.12), "leg_L"),
    "leg_R": ((-0.12, 0.0, 0.30), "root"),
    "foot_R": ((-0.12, 0.0, 0.12), "leg_R"),
}


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


_materials: dict[str, bpy.types.Material] = {}


def material(name: str):
    """One material per HERO_* palette key; the slot name is the colour."""
    if name not in _materials:
        mat = bpy.data.materials.new(name)
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = rgba(name)
        bsdf.inputs["Roughness"].default_value = 0.8
        _materials[name] = mat
    return _materials[name]


def _object(name: str, bm, bone: str, colour: str):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material(colour))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")  # rigid: one bone, weight 1
    return obj


def box(name, lo, hi, bone, colour, bevel=0.0):
    """An axis-aligned box from Blender-space corner `lo` to `hi`, weighted to `bone`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
    if bevel > 0:
        bmesh.ops.bevel(
            bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES", clamp_overlap=True
        )
    return _object(name, bm, bone, colour)


def cylinder(name, centre, z0, z1, r0, r1, bone, colour, segments=24):
    """A capped (truncated) cone from radius r0 at z0 to r1 at z1, smooth-sided."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=segments, radius1=r0, radius2=r1, depth=z1 - z0
    )
    for v in bm.verts:
        v.co.x += centre[0]
        v.co.y += centre[1]
        v.co.z += (z0 + z1) / 2
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.9  # sides smooth, caps flat
    return _object(name, bm, bone, colour)


def mirrored(side: str, x: float) -> float:
    return x if side == "L" else -x


def build_mesh() -> list:
    """Pip's parts, each rigidly weighted to one bone. Blender -Y is Pip's front."""
    parts = []
    for s in ("L", "R"):
        x0, x1 = sorted((mirrored(s, 0.04), mirrored(s, 0.21)))
        parts.append(box(f"boot_{s}", (x0, -0.17, 0.0), (x1, 0.09, 0.14), f"foot_{s}", "HERO_BOOT", 0.025))
        parts.append(cylinder(f"leg_{s}", (mirrored(s, 0.12), -0.01), 0.12, 0.32, 0.065, 0.065, f"leg_{s}", "HERO_COAT_DARK", 12))
        x0, x1 = sorted((mirrored(s, 0.27), mirrored(s, 0.41)))
        parts.append(box(f"sleeve_{s}", (x0, -0.08, 0.50), (x1, 0.08, 0.80), f"arm_{s}", "HERO_COAT", 0.03))
        x0, x1 = sorted((mirrored(s, 0.29), mirrored(s, 0.44)))
        parts.append(box(f"glove_{s}", (x0, -0.07, 0.35), (x1, 0.07, 0.51), f"hand_{s}", "HERO_GLOVE", 0.03))
        ex = mirrored(s, 0.09)
        parts.append(box(f"eye_{s}", (ex - 0.025, -0.222, 1.00), (ex + 0.025, -0.205, 1.05), "head", "HERO_GLOVE"))
        parts.append(box(f"brow_{s}", (ex - 0.055, -0.226, 1.065), (ex + 0.055, -0.205, 1.095), "head", "HERO_HAIR"))

    # Coat: the skirt rides the hips, the torso the spine.
    parts.append(box("coat_skirt", (-0.30, -0.22, 0.22), (0.30, 0.20, 0.53), "hips", "HERO_COAT", 0.05))
    parts.append(box("coat_torso", (-0.28, -0.21, 0.50), (0.28, 0.19, 0.80), "spine", "HERO_COAT", 0.06))
    parts.append(box("collar", (-0.20, -0.20, 0.76), (0.20, 0.14, 0.84), "spine", "HERO_COAT_DARK", 0.03))
    parts.append(box("pocket", (0.06, -0.226, 0.60), (0.20, -0.20, 0.68), "spine", "HERO_LEATHER"))
    for i, z in enumerate((0.36, 0.46, 0.58, 0.70)):
        parts.append(box(f"button_{i}", (-0.09, -0.232, z), (-0.06, -0.21, z + 0.03), "spine" if z > 0.5 else "hips", "HERO_COAT_DARK"))

    # Head: big, skin, with face details as small geometry.
    parts.append(box("head", (-0.26, -0.21, 0.80), (0.26, 0.19, 1.18), "head", "HERO_SKIN", 0.07))
    parts.append(box("nose", (-0.04, -0.27, 0.92), (0.04, -0.20, 1.00), "head", "HERO_SKIN", 0.015))
    parts.append(box("hair", (-0.27, -0.04, 0.95), (0.27, 0.20, 1.16), "head", "HERO_HAIR", 0.04))
    parts.append(box("moustache", (-0.13, -0.25, 0.86), (0.13, -0.20, 0.92), "head", "HERO_HAIR", 0.015))
    parts.append(box("scar", (-0.145, -0.226, 0.96), (-0.12, -0.205, 1.10), "head", "HERO_SCAR"))

    # Hat: brim and crown are the silhouette from the 65° camera.
    parts.append(cylinder("hat_brim", (0, 0), 1.14, 1.18, 0.37, 0.37, "hat", "HERO_HAT", 32))
    parts.append(cylinder("hat_band", (0, 0), 1.18, 1.25, 0.232, 0.236, "hat", "HERO_HAT_BAND", 32))
    parts.append(cylinder("hat_crown", (0, 0), 1.18, 1.50, 0.215, 0.235, "hat", "HERO_HAT", 32))
    return parts


def join(name: str, parts: list):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = parts[0]
    obj.name = name
    obj.data.name = name
    return obj


def build_armature():
    data = bpy.data.armatures.new("pip_rig")
    arm = bpy.data.objects.new("pip_rig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, parent) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = (head[0], head[1], head[2] + BONE_LENGTH)
        bone.roll = 0.0
        bone.use_deform = True
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    return arm


def skin(mesh, arm) -> None:
    mesh.parent = arm
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


# Clips: {bone: {property: {frame: value}}}. Pose values are bone-local; every bone points
# up, so local x is world x, local y is up, and a positive x rotation swings a hanging
# limb backward (+Y). Loops end on their first pose.
SQUASH = (1.08, 0.90, 1.08)
STRETCH = (0.96, 1.06, 0.96)
REST = (1.0, 1.0, 1.0)
IDLE = {
    "spine": {"scale": {0: REST, 24: (1.0, 1.035, 1.0), 48: REST}},
    "head": {"rotation_euler": {0: (0, 0, 0), 24: (-0.04, 0, 0), 48: (0, 0, 0)}},
    "arm_L": {"rotation_euler": {0: (0, 0, 0), 24: (0, -0.05, 0), 48: (0, 0, 0)}},
    "arm_R": {"rotation_euler": {0: (0, 0, 0), 24: (0, 0.05, 0), 48: (0, 0, 0)}},
}
WALK = {
    # One full cycle: left foot forward at 0, right foot forward at 8; a squash just after
    # each footfall (2, 10) and a stretch at the passing pose (5, 13).
    "root": {"scale": {0: REST, 2: SQUASH, 5: STRETCH, 8: REST, 10: SQUASH, 13: STRETCH, 16: REST}},
    "hips": {"location": {0: (0, 0, 0), 2: (0, -0.03, 0), 5: (0, 0.05, 0), 8: (0, 0, 0), 10: (0, -0.03, 0), 13: (0, 0.05, 0), 16: (0, 0, 0)}},
    "spine": {"rotation_euler": {0: (0, 0.10, 0), 8: (0, -0.10, 0), 16: (0, 0.10, 0)}},
    "leg_L": {"rotation_euler": {0: (-0.5, 0, 0), 8: (0.5, 0, 0), 16: (-0.5, 0, 0)}},
    "leg_R": {"rotation_euler": {0: (0.5, 0, 0), 8: (-0.5, 0, 0), 16: (0.5, 0, 0)}},
    "arm_L": {"rotation_euler": {0: (0.4, 0, 0), 8: (-0.4, 0, 0), 16: (0.4, 0, 0)}},
    "arm_R": {"rotation_euler": {0: (-0.4, 0, 0), 8: (0.4, 0, 0), 16: (-0.4, 0, 0)}},
    "hat": {"rotation_euler": {0: (0, 0, 0), 3: (0.06, 0, 0), 8: (0, 0, 0), 11: (0.06, 0, 0), 16: (0, 0, 0)}},
}


def rest_pose(arm) -> None:
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)


def action(arm, name: str, keys: dict):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True  # zero-user actions are not saved, and the exporter can't see them
    arm.animation_data.action = act
    rest_pose(arm)
    for bone, props in keys.items():
        pb = arm.pose.bones[bone]
        for prop, frames in props.items():
            for frame, value in frames.items():
                setattr(pb, prop, value)
                pb.keyframe_insert(data_path=prop, frame=frame)
    rest_pose(arm)
    return act


def build():
    """Build Pip in a fresh scene (export is separate, so tests can break the scene first)."""
    reset_scene()
    _materials.clear()
    arm = build_armature()
    mesh = join("pip", build_mesh())
    skin(mesh, arm)
    arm.animation_data_create()
    idle = action(arm, "idle", IDLE)
    action(arm, "walk", WALK)
    arm.animation_data.action = idle
    bpy.context.scene.frame_set(0)
    return arm, mesh


if __name__ == "__main__":
    build()
    export_glb(OUT, profile="skinned")

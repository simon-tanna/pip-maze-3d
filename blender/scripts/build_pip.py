"""Build Pip from primitives, refined towards docs/art/pip-concept.png, and export it skinned.

The character contract (3d-slice ticket 06, m1 ticket 10):
  * faces Blender -Y (three +Z, south), origin between the feet at Z = 0, 1.5 m tall,
    footprint inside 1.2 m; big head, and the hat crown and brim are the silhouette;
  * one armature of 13 snake_case bones (BONES below), every part rigidly weighted to one
    bone (one influence per vertex);
  * actions `idle` (breathing) and `walk` (one full cycle, two footfalls, bob and squash),
    each with a fake user; code adds no procedural squash, the clips own the feel;
  * material slots named after HERO_* palette keys (export_glb rewrites Base Color from
    palette.json).

Ticket 11 (the fidelity pass) froze the bone names and parents, the root, and the slot
names for ticket 15; tests/unit/pip-glb.test.ts pins them. Look-dev renders of this build:
blender/scripts/render_pip.py.
Run: pnpm assets:build (every builder) -> public/models/characters/pip.glb
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "characters" / "pip.glb"
FPS = 24
BONE_LENGTH = 0.08  # every bone points up (+Z) from its pivot, so local X is world X

# Rest-pose shaping (ticket 11). The arms hang in a slight A-pose, and the hat sits back on
# the head, tipped up at the front, so the face reads under the brim from the 66 deg game
# camera (a level brim hides everything above the moustache).
ARM_SPLAY = math.radians(28.0)
SHOULDER = [0.29, 0.0, 0.74]
SLEEVE_LENGTH = 0.27
HAT_PIVOT = [0.0, 0.05, 1.11]
HAT_TILT = math.radians(14.0)


def _splayed(side: str, drop: float) -> list[float]:
    """A point `drop` m down the arm from the shoulder, after the A-pose splay."""
    sign = 1.0 if side == "L" else -1.0
    return [
        sign * (SHOULDER[0] + drop * math.sin(ARM_SPLAY)),
        SHOULDER[1],
        SHOULDER[2] - drop * math.cos(ARM_SPLAY),
    ]


# name: (pivot head in Blender space, parent)
# Vectors are [x, y, z] lists, so tests/unit/no-colour-literals.test.ts never reads them as RGB.
# Frozen by ticket 11 for ticket 15: the names and parents (pivots may still be tuned).
BONES: dict[str, tuple[list[float], str | None]] = {
    "root": ([0.0, 0.0, 0.0], None),
    "hips": ([0.0, 0.0, 0.32], "root"),
    "spine": ([0.0, 0.0, 0.50], "hips"),
    "head": ([0.0, 0.0, 0.76], "spine"),
    "hat": (HAT_PIVOT, "head"),
    "arm_L": ([SHOULDER[0], 0.0, SHOULDER[2]], "spine"),
    "hand_L": (_splayed("L", SLEEVE_LENGTH), "arm_L"),
    "arm_R": ([-SHOULDER[0], 0.0, SHOULDER[2]], "spine"),
    "hand_R": (_splayed("R", SLEEVE_LENGTH), "arm_R"),
    "leg_L": ([0.12, 0.0, 0.28], "root"),
    "foot_L": ([0.12, 0.0, 0.10], "leg_L"),
    "leg_R": ([-0.12, 0.0, 0.28], "root"),
    "foot_R": ([-0.12, 0.0, 0.10], "leg_R"),
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


def about(pivot, rot) -> Matrix:
    """Rotate by Euler `rot` (radians, XYZ) about the point `pivot`."""
    p = Matrix.Translation(Vector(pivot))
    return p @ Euler(rot, "XYZ").to_matrix().to_4x4() @ p.inverted()


def _object(name: str, bm, bone: str, colour: str, xf: Matrix | None = None):
    if xf is not None:
        bmesh.ops.transform(bm, matrix=xf, verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material(colour))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")  # rigid: one bone, weight 1
    return obj


def box(name, lo, hi, bone, colour, bevel=0.0, *, taper=(1.0, 1.0), rot=None, xf=None):
    """A box from Blender-space corner `lo` to `hi`, weighted to `bone`.

    `taper` scales the top face's x and y about the box's axis (a jaw wider than the
    crown, a coat flaring to the knee); `rot` turns the box about its own centre; `xf`
    is a final world transform. Bevelled boxes shade smooth, like clay.
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    for v in bm.verts:
        top = v.co.z > 0
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
        if top:
            v.co.x = cx + (v.co.x - cx) * taper[0]
            v.co.y = cy + (v.co.y - cy) * taper[1]
    if bevel > 0:
        bmesh.ops.bevel(
            bm, geom=bm.edges[:], offset=bevel, segments=3, affect="EDGES", clamp_overlap=True
        )
        for f in bm.faces:
            f.smooth = True
    if rot is not None:
        centre = [(a + b) / 2 for a, b in zip(lo, hi)]
        bmesh.ops.transform(bm, matrix=about(centre, rot), verts=bm.verts)
    return _object(name, bm, bone, colour, xf)


def cylinder(name, centre, z0, z1, r0, r1, bone, colour, segments=24, *, xf=None):
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
    return _object(name, bm, bone, colour, xf)


def blob(name, centre, radii, bone, colour, *, xf=None):
    """A smooth ellipsoid (nose, buttons)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        v.co.x = centre[0] + v.co.x * radii[0]
        v.co.y = centre[1] + v.co.y * radii[1]
        v.co.z = centre[2] + v.co.z * radii[2]
    for f in bm.faces:
        f.smooth = True
    return _object(name, bm, bone, colour, xf)


def mirrored(side: str, x: float) -> float:
    return x if side == "L" else -x


def span(side: str, a: float, b: float) -> tuple[float, float]:
    """The x interval [a, b] on Pip's `side`, ordered low to high."""
    lo, hi = sorted((mirrored(side, a), mirrored(side, b)))
    return lo, hi


def build_limbs(s: str) -> list:
    """One side's boot, trouser leg, sleeve and glove. Pip's left (L) is Blender +X."""
    parts = []
    x0, x1 = span(s, 0.03, 0.21)
    parts.append(box(f"boot_{s}", (x0, -0.18, 0.0), (x1, 0.08, 0.11), f"foot_{s}", "HERO_BOOT", 0.035))
    parts.append(cylinder(f"boot_shaft_{s}", (mirrored(s, 0.12), -0.02), 0.08, 0.20, 0.078, 0.082, f"foot_{s}", "HERO_BOOT", 16))
    parts.append(cylinder(f"leg_{s}", (mirrored(s, 0.12), -0.01), 0.18, 0.32, 0.062, 0.066, f"leg_{s}", "HERO_COAT_DARK", 12))

    # Sleeve, cuff and glove hang straight from the shoulder, then splay out (A-pose).
    sx = mirrored(s, SHOULDER[0])
    splay = about([sx, 0.0, SHOULDER[2]], (0.0, -mirrored(s, ARM_SPLAY), 0.0))
    top, bottom = SHOULDER[2] + 0.04, SHOULDER[2] - SLEEVE_LENGTH
    parts.append(cylinder(f"sleeve_{s}", (sx, 0.0), bottom + 0.04, top, 0.088, 0.082, f"arm_{s}", "HERO_COAT", 16, xf=splay))
    parts.append(cylinder(f"cuff_{s}", (sx, 0.0), bottom, bottom + 0.06, 0.098, 0.096, f"arm_{s}", "HERO_COAT", 16, xf=splay))
    # Chunky glove: a wide gauntlet cuff, a fat palm, three finger nubs and a thumb.
    gx = SHOULDER[0]
    parts.append(cylinder(f"gauntlet_{s}", (sx, 0.0), bottom - 0.035, bottom + 0.02, 0.085, 0.092, f"hand_{s}", "HERO_GLOVE", 16, xf=splay))
    x0, x1 = span(s, gx - 0.08, gx + 0.08)
    parts.append(box(f"palm_{s}", (x0, -0.075, bottom - 0.14), (x1, 0.075, bottom - 0.02), f"hand_{s}", "HERO_GLOVE", 0.045, xf=splay))
    for i, fy in enumerate((-0.05, 0.0, 0.05)):
        x0, x1 = span(s, gx - 0.035 + 0.01 * abs(i - 1), gx + 0.065)
        parts.append(box(f"finger_{s}{i}", (x0, fy - 0.026, bottom - 0.21), (x1, fy + 0.026, bottom - 0.11), f"hand_{s}", "HERO_GLOVE", 0.022, xf=splay))
    x0, x1 = span(s, gx - 0.10, gx - 0.035)
    parts.append(box(f"thumb_{s}", (x0, -0.10, bottom - 0.12), (x1, -0.035, bottom - 0.04), f"hand_{s}", "HERO_GLOVE", 0.025, xf=splay))
    return parts


def build_coat() -> list:
    parts = []
    # Knee-length navy coat: the skirt flares from the hips, the torso rides the spine.
    parts.append(box("coat_skirt", [-0.33, -0.245, 0.17], [0.33, 0.215, 0.50], "hips", "HERO_COAT", 0.05, taper=(0.85, 0.88)))
    parts.append(box("coat_torso", [-0.285, -0.212, 0.40], [0.285, 0.192, 0.78], "spine", "HERO_COAT", 0.08, taper=(0.92, 0.95)))
    # Turned-down collar: a back and two lapels angled open over a V of the shirt.
    parts.append(box("collar_back", [-0.24, -0.04, 0.70], [0.24, 0.20, 0.84], "spine", "HERO_COAT", 0.04))
    for s in ("L", "R"):
        x0, x1 = span(s, 0.03, 0.22)
        parts.append(box(f"lapel_{s}", (x0, -0.238, 0.64), (x1, -0.19, 0.80), "spine", "HERO_COAT", 0.022, taper=(0.7, 1.0), rot=[0.0, mirrored(s, 0.28), 0.0]))
        x0, x1 = span(s, 0.12, 0.25)
        parts.append(box(f"pocket_flap_{s}", (x0, -0.252, 0.33), (x1, -0.225, 0.36), "hips", "HERO_COAT_DARK", 0.008, rot=[0.0, mirrored(s, -0.12), 0.0]))
    parts.append(box("shirt", [-0.07, -0.205, 0.70], [0.07, -0.16, 0.79], "spine", "HERO_SKIN"))
    # Chest pocket on Pip's left (viewer's right), brown leather, as in the concept.
    parts.append(box("pocket", [0.07, -0.226, 0.58], [0.22, -0.20, 0.665], "spine", "HERO_LEATHER", 0.008, taper=(1.08, 1.0)))
    for i, z in enumerate([0.30, 0.40, 0.56, 0.65]):
        bone = "spine" if z > 0.5 else "hips"
        y = -0.235 if z > 0.5 else -0.245
        parts.append(blob(f"button_{i}", [-0.075, y, z], [0.018, 0.012, 0.018], bone, "HERO_COAT_DARK"))
    return parts


def build_head() -> list:
    """Big square head, wider at the jaw. Every face feature is small geometry in its own
    HERO_* slot, never painted colour."""
    parts = []
    parts.append(box("head", [-0.28, -0.25, 0.74], [0.28, 0.21, 1.14], "head", "HERO_SKIN", 0.12, taper=(0.92, 0.95)))
    for s in ("L", "R"):
        x0, x1 = span(s, 0.25, 0.31)
        parts.append(box(f"ear_{s}", (x0, -0.04, 0.88), (x1, 0.04, 1.00), "head", "HERO_SKIN", 0.025))
        x0, x1 = span(s, 0.235, 0.29)
        parts.append(box(f"sideburn_{s}", (x0, -0.09, 0.95), (x1, 0.03, 1.12), "head", "HERO_HAIR", 0.025, taper=(1.0, 1.15)))
        ex = mirrored(s, 0.10)
        parts.append(box(f"eye_{s}", (ex - 0.042, -0.262, 0.965), (ex + 0.042, -0.24, 1.02), "head", "HERO_EYE", 0.008))
        px = ex - mirrored(s, 0.012)  # pupils sit toward the nose: the concept's glare
        parts.append(box(f"pupil_{s}", (px - 0.018, -0.268, 0.97), (px + 0.018, -0.255, 1.012), "head", "HERO_PUPIL", 0.004))
        # Heavy brows, inner ends low: a scowl.
        parts.append(box(f"brow_{s}", (ex - 0.075, -0.282, 1.02), (ex + 0.075, -0.232, 1.078), "head", "HERO_HAIR", 0.02, rot=[0.0, mirrored(s, 0.24), 0.0]))
        # Moustache wings droop past the mouth corners.
        x0, x1 = span(s, 0.03, 0.185)
        parts.append(box(f"moustache_{s}", (x0, -0.30, 0.84), (x1, -0.245, 0.905), "head", "HERO_HAIR", 0.024, rot=[0.0, mirrored(s, -0.30), 0.0]))
    # One bushy moustache: a centre pad bridges the two wings under the nose.
    parts.append(box("moustache", [-0.08, -0.305, 0.865], [0.08, -0.245, 0.92], "head", "HERO_HAIR", 0.024))
    parts.append(box("hair_back", [-0.255, 0.03, 0.92], [0.255, 0.228, 1.13], "head", "HERO_HAIR", 0.05))
    parts.append(blob("nose", [0.0, -0.275, 0.935], [0.05, 0.045, 0.048], "head", "HERO_SKIN"))
    # The red scar over the eye on the viewer's left (Pip's right), as the concept draws it:
    # a jagged stroke from brow to cheek.
    parts.append(box("scar_upper", [-0.14, -0.266, 0.995], [-0.122, -0.245, 1.095], "head", "HERO_SCAR", rot=[0.0, -0.25, 0.0]))
    parts.append(box("scar_lower", [-0.135, -0.266, 0.90], [-0.117, -0.245, 1.0], "head", "HERO_SCAR", rot=[0.0, 0.2, 0.0]))
    return parts


def build_hat() -> list:
    """Tall olive hat with a band and a wide brim, the silhouette from the game camera.
    Built level on HAT_PIVOT, then tipped back by HAT_TILT."""
    tilt = about(HAT_PIVOT, (-HAT_TILT, 0.0, 0.0))
    c = (HAT_PIVOT[0], HAT_PIVOT[1])
    z = HAT_PIVOT[2]
    return [
        cylinder("hat_brim", c, z, z + 0.035, 0.37, 0.36, "hat", "HERO_HAT", 40, xf=tilt),
        cylinder("hat_band", c, z + 0.03, z + 0.10, 0.238, 0.240, "hat", "HERO_HAT_BAND", 40, xf=tilt),
        cylinder("hat_crown", c, z + 0.03, z + 0.33, 0.225, 0.235, "hat", "HERO_HAT", 40, xf=tilt),
    ]


def build_mesh() -> list:
    """Pip's parts, each rigidly weighted to one bone. Blender -Y is Pip's front."""
    parts = []
    for s in ("L", "R"):
        parts += build_limbs(s)
    return parts + build_coat() + build_head() + build_hat()


def join(name: str, parts: list):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = parts[0]
    obj.name = name
    obj.data.name = name
    # Face-area weighted normals: the big faces of a bevelled box shade flat and only the
    # bevels round off (plain smooth shading smears every box face).
    mod = obj.modifiers.new("weighted", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.weight = 100
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
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
# up, so local x is world x, local y is up (world z) and local z is backward (world -y).
# A positive x rotation tips an upright bone's top forward and swings a hanging limb
# backward; a positive z rotation swings Pip's left arm out. Loops end on their first pose.
SQUASH = [1.09, 0.88, 1.09]
STRETCH = [0.95, 1.07, 0.95]
REST = [1.0, 1.0, 1.0]
ZERO = [0.0, 0.0, 0.0]
IDLE = {
    # Two seconds: breathe in to 24 and out; the head and arms follow the chest a beat late.
    "spine": {"scale": {0: REST, 24: [1.015, 1.04, 1.015], 48: REST}},
    "hips": {"rotation_euler": {0: ZERO, 24: [0, 0.03, 0], 48: ZERO}},
    "head": {"rotation_euler": {0: ZERO, 6: [0.02, 0, 0], 30: [-0.05, 0.02, 0], 48: ZERO}},
    "hat": {"rotation_euler": {0: ZERO, 10: ZERO, 34: [-0.025, 0, 0], 48: ZERO}},
    "arm_L": {"rotation_euler": {0: ZERO, 28: [0.03, 0, 0.07], 48: ZERO}},
    "arm_R": {"rotation_euler": {0: ZERO, 28: [0.03, 0, -0.07], 48: ZERO}},
    "hand_L": {"rotation_euler": {0: ZERO, 32: [0, 0.12, 0], 48: ZERO}},
    "hand_R": {"rotation_euler": {0: ZERO, 32: [0, -0.12, 0], 48: ZERO}},
}
WALK = {
    # One full cycle (two tiles in game): left foot forward at 0, right foot forward at 8; a
    # squash just after each footfall (2, 10), a stretch at the passing pose (5, 13), and
    # the swinging leg lifts its foot clear as it passes (4, 12). Pip leans into the walk
    # and stomps: his torso twists against his hips and the hat lags a beat behind.
    "root": {"scale": {0: REST, 2: SQUASH, 5: STRETCH, 8: REST, 10: SQUASH, 13: STRETCH, 16: REST}},
    "hips": {
        "location": {0: ZERO, 2: [0, -0.035, 0], 5: [0, 0.05, 0], 8: ZERO, 10: [0, -0.035, 0], 13: [0, 0.05, 0], 16: ZERO},
        "rotation_euler": {0: [0, -0.10, 0], 8: [0, 0.10, 0], 16: [0, -0.10, 0]},
    },
    "spine": {"rotation_euler": {0: [0.10, 0.14, 0], 8: [0.10, -0.14, 0], 16: [0.10, 0.14, 0]}},
    "head": {"rotation_euler": {0: [-0.08, -0.06, 0], 3: [-0.03, -0.06, 0], 8: [-0.08, 0.06, 0], 11: [-0.03, 0.06, 0], 16: [-0.08, -0.06, 0]}},
    "leg_L": {
        "rotation_euler": {0: [-0.55, 0, 0], 8: [0.55, 0, 0], 16: [-0.55, 0, 0]},
        "location": {0: ZERO, 8: ZERO, 12: [0, 0.06, 0], 16: ZERO},
    },
    "leg_R": {
        "rotation_euler": {0: [0.55, 0, 0], 8: [-0.55, 0, 0], 16: [0.55, 0, 0]},
        "location": {0: ZERO, 4: [0, 0.06, 0], 8: ZERO, 16: ZERO},
    },
    # Heel strike on the leading foot, toe push-off on the trailing one.
    "foot_L": {"rotation_euler": {0: [0.25, 0, 0], 8: [-0.15, 0, 0], 16: [0.25, 0, 0]}},
    "foot_R": {"rotation_euler": {0: [-0.15, 0, 0], 8: [0.25, 0, 0], 16: [-0.15, 0, 0]}},
    "arm_L": {"rotation_euler": {0: [0.5, 0, 0], 8: [-0.5, 0, 0], 16: [0.5, 0, 0]}},
    "arm_R": {"rotation_euler": {0: [-0.5, 0, 0], 8: [0.5, 0, 0], 16: [-0.5, 0, 0]}},
    "hand_L": {"rotation_euler": {0: [0.0, 0, 0], 2: [0.25, 0, 0], 10: [-0.25, 0, 0], 16: [0.0, 0, 0]}},
    "hand_R": {"rotation_euler": {0: [0.0, 0, 0], 2: [-0.25, 0, 0], 10: [0.25, 0, 0], 16: [0.0, 0, 0]}},
    "hat": {"rotation_euler": {0: ZERO, 3: [0.08, 0, 0.03], 8: ZERO, 11: [0.08, 0, -0.03], 16: ZERO}},
}


def rest_pose(arm) -> None:
    for pb in arm.pose.bones:
        pb.location = [0, 0, 0]
        pb.rotation_euler = [0, 0, 0]
        pb.scale = [1, 1, 1]


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

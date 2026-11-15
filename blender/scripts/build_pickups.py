"""Procedurally build the gold pickups and export them as one .glb.

One scene, one GLB (public/models/pickups.glb) with the nodes of the contract in
src/render/pickups.ts (checked by tests/unit/pickups-glb.test.ts): `key`, `coin`, `chest`
and `chest_lid`. Slice ticket 14, ADR 0001: GOLD metal with a subtle GOLD_LIGHT emissive
that the render side drives (bloom does the glow; there are no lights here or in the view).

Frames (three.js, after export_yup maps Blender (x, y, z) to three (x, z, -y)):
  * key: ~0.6 m along x, in the x/y plane, centred on its pivot (the view floats and turns it).
  * coin: a 0.4 m disc facing south (+z), centred on its pivot.
  * chest: 1.2 m wide (x), 0.8 m deep (z), base on y = 0, body CHEST_HEIGHT tall.
  * chest_lid: its local origin is the hinge, the body's back top edge (y = CHEST_HEIGHT,
    z = -CHEST_DEPTH / 2, mirrored as LID_HINGE in pickups.ts); it reaches south (+z) and up.

Key and coin share one material (`pickup_gold`); chest and lid share another
(`chest_gold`), so the chest's emissive pulse never touches the keys.

Run: pnpm assets:build (runs every build_*.py)
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "pickups.glb"

KEY_LENGTH = 0.6
COIN_DIAMETER = 0.4
CHEST_WIDTH = 1.2
CHEST_DEPTH = 0.8
CHEST_HEIGHT = 0.6  # body; mirrored as CHEST_HEIGHT / LID_HINGE.y in pickups.ts
LID_SLAB = 0.08
LID_DOME = 0.16
SMOOTH_ANGLE = math.radians(35)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def gold(name: str, roughness: float, emission: float):
    """GOLD metal with a GOLD_LIGHT emission (strength ≤ 1, so glTF keeps the hue exactly)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba("GOLD")
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = rgba("GOLD_LIGHT")
    bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def new_object(name: str, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(bm, lo, hi, bevel: float = 0.012) -> None:
    """A bevelled box from Blender-space corner `lo` to `hi`, added to `bm`."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    for v in tmp.verts:
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=2, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    merge(bm, tmp)


def cylinder(bm, radius: float, depth: float, centre, axis: str, segments: int = 32,
             squash_z: float = 1) -> None:
    """A closed cylinder of `radius` and `depth` along Blender `axis` ("x" or "y"), its
    Blender z scaled by `squash_z` about `centre`."""
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=segments, radius1=radius,
                          radius2=radius, depth=depth)
    rot = {"x": ("Y", math.pi / 2), "y": ("X", math.pi / 2)}[axis]
    from mathutils import Matrix

    bmesh.ops.transform(tmp, matrix=Matrix.Rotation(rot[1], 4, rot[0]), verts=tmp.verts)
    for v in tmp.verts:
        v.co.x += centre[0]
        v.co.y += centre[1]
        v.co.z = v.co.z * squash_z + centre[2]
    merge(bm, tmp)


def torus(bm, major: float, minor: float, centre, major_segments: int = 32,
          minor_segments: int = 10) -> None:
    """A ring in Blender's x/z plane (three's x/y plane: it faces south), around `centre`."""
    tmp = bmesh.new()
    rings = []
    for i in range(major_segments):
        a = 2 * math.pi * i / major_segments
        ring = []
        for j in range(minor_segments):
            b = 2 * math.pi * j / minor_segments
            r = major + minor * math.cos(b)
            ring.append(tmp.verts.new((centre[0] + r * math.cos(a),
                                       centre[1] + minor * math.sin(b),
                                       centre[2] + r * math.sin(a))))
        rings.append(ring)
    for i in range(major_segments):
        for j in range(minor_segments):
            a, b = rings[i], rings[(i + 1) % major_segments]
            jn = (j + 1) % minor_segments
            tmp.faces.new((a[j], b[j], b[jn], a[jn]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
    merge(bm, tmp)


def merge(bm, tmp) -> None:
    offset = {}
    for v in tmp.verts:
        offset[v] = bm.verts.new(v.co)
    for f in tmp.faces:
        bm.faces.new([offset[v] for v in f.verts])
    tmp.free()


def smooth(obj) -> None:
    """Smooth shading with hard edges past SMOOTH_ANGLE (no modifier, so nothing to apply)."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=SMOOTH_ANGLE)


def build_key(mat):
    """A bow ring, a collar, a shaft and two bit teeth; x from -0.3 to 0.3 (three y up)."""
    bm = bmesh.new()
    half = KEY_LENGTH / 2
    bow_major, bow_minor = 0.095, 0.032
    bow_x = -half + bow_major + bow_minor
    torus(bm, bow_major, bow_minor, (bow_x, 0, 0.0))
    shaft = 0.026
    box(bm, (bow_x + bow_major, -shaft, -shaft), (half, shaft, shaft), bevel=0.008)
    cylinder(bm, 0.045, 0.035, (bow_x + bow_major + 0.03, 0, 0), "x", segments=16)
    # Teeth hang below the shaft (Blender -z is three -y).
    box(bm, (half - 0.13, -shaft, -0.12), (half - 0.08, shaft, 0), bevel=0.006)
    box(bm, (half - 0.055, -shaft, -0.09), (half, shaft, 0), bevel=0.006)
    obj = new_object("key", bm, mat)
    smooth(obj)
    return obj


def build_coin(mat):
    """A disc with a raised rim and a centre boss, facing three's south (Blender -y)."""
    bm = bmesh.new()
    r = COIN_DIAMETER / 2
    rim_minor = 0.02
    cylinder(bm, r - rim_minor, 0.04, (0, 0, 0), "y", segments=40)
    torus(bm, r - rim_minor, rim_minor, (0, 0, 0), major_segments=40, minor_segments=8)
    cylinder(bm, 0.075, 0.056, (0, 0, 0), "y", segments=24)
    obj = new_object("coin", bm, mat)
    smooth(obj)
    return obj


def build_chest(mat):
    """The body: a bevelled box on a base trim, two straps and a lock plate on the front."""
    bm = bmesh.new()
    hx, hy = CHEST_WIDTH / 2, CHEST_DEPTH / 2
    box(bm, (-hx + 0.01, -hy + 0.01, 0.0), (hx - 0.01, hy - 0.01, CHEST_HEIGHT), bevel=0.02)
    box(bm, (-hx, -hy, 0.0), (hx, hy, 0.07), bevel=0.015)  # base trim
    for sx in (-0.36, 0.36):  # straps: front, back and sides of the body
        box(bm, (sx - 0.045, -hy - 0.012, 0.0), (sx + 0.045, hy + 0.012, CHEST_HEIGHT - 0.005),
            bevel=0.008)
    box(bm, (-0.085, -hy - 0.025, CHEST_HEIGHT - 0.22), (0.085, -hy, CHEST_HEIGHT - 0.03),
        bevel=0.01)  # lock plate
    obj = new_object("chest", bm, mat)
    smooth(obj)
    return obj


def build_lid(mat):
    """A slab and a flattened half-barrel, modelled from the hinge (local origin), reaching
    Blender -y (three south) by CHEST_DEPTH; straps and a hasp match the body's."""
    bm = bmesh.new()
    hx = CHEST_WIDTH / 2
    d = CHEST_DEPTH
    box(bm, (-hx, -d, 0.0), (hx, 0.0, LID_SLAB), bevel=0.015)
    dome = bmesh.new()
    cylinder(dome, d / 2, CHEST_WIDTH - 0.02, (0, -d / 2, LID_SLAB), "x", segments=32,
             squash_z=LID_DOME / (d / 2))
    bmesh.ops.bisect_plane(dome, geom=list(dome.verts) + list(dome.edges) + list(dome.faces),
                           plane_co=(0, 0, LID_SLAB), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.contextual_create(dome, geom=[e for e in dome.edges if e.is_boundary])
    merge(bm, dome)
    for sx in (-0.36, 0.36):
        strap = bmesh.new()
        cylinder(strap, d / 2 + 0.012, 0.09, (sx, -d / 2, LID_SLAB), "x", segments=32,
                 squash_z=(LID_DOME + 0.012) / (d / 2 + 0.012))
        bmesh.ops.bisect_plane(strap,
                               geom=list(strap.verts) + list(strap.edges) + list(strap.faces),
                               plane_co=(0, 0, LID_SLAB), plane_no=(0, 0, 1), clear_inner=True)
        bmesh.ops.contextual_create(strap, geom=[e for e in strap.edges if e.is_boundary])
        merge(bm, strap)
    box(bm, (-0.06, -d - 0.025, -0.06), (0.06, -d, LID_SLAB + 0.02), bevel=0.008)  # hasp
    obj = new_object("chest_lid", bm, mat)
    smooth(obj)
    return obj


def build_pickups() -> None:
    reset_scene()
    pickup = gold("pickup_gold", roughness=0.3, emission=0.6)
    chest = gold("chest_gold", roughness=0.42, emission=0.4)
    build_key(pickup)
    coin = build_coin(pickup)
    coin.location.x = 1  # spread out for anyone opening the GLB; the view
    build_chest(chest).location = (0.0, -2.0, 0.0)  # uses each node's local geometry only
    # The lid sits closed on the body: its node's transform is the hinge.
    build_lid(chest).location = (0.0, -2.0 + CHEST_DEPTH / 2, CHEST_HEIGHT)
    export_glb(OUT)


if __name__ == "__main__":
    build_pickups()

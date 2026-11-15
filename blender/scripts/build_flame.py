"""Procedurally build the flame trap's floor grate and nozzle and export it as one .glb.

One scene, one GLB (public/models/hazards/flame.glb) with the node contract in
src/render/flames.ts (`FLAME_NODES`, checked by tests/unit/flame-model.test.ts), modelled
in a tile's local frame: centred on the origin, base on the floor (Blender z = 0), inside
the tile and low enough to walk over. Slice ticket 12, map ticket 07 (preset D).

  * `bed`: a flat 1.2 m square just above the floor, under the bars. `EMBER_DARK` base;
    render gives each flame its own copy and heats its emissive EMBER_DARK → FIRE_HOT.
  * `grate`: the frame and five bars over the bed, dark iron (`SHADOW`, metal). Steel is
    reserved for blades and spikes, so the grate is not steel.
  * `nozzle`: a squat stone ring (`STONE_DARK`) round the vent, under the bars.

Materials are flat Principled BSDFs with palette inputs, each named after its palette
key; the parts are small and dark, so they get no baked atlas.

Blender is Z-up and export_yup maps Blender (x, y, z) to three.js (x, z, -y).

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

OUT = MODELS_DIR / "hazards" / "flame.glb"

BED_HALF = 0.6  # the bed is 1.2 m square
BED_LIFT = 0.012  # above the floor, so it never z-fights the flagstone
FRAME_HALF = 0.68  # the frame's outer half-width (1.36 m)
FRAME_BAR = 0.1  # frame bar width
BAR_WIDTH = 0.05
BAR_PITCH = 0.22
GRATE_TOP = 0.07
NOZZLE_OUTER = 0.3
NOZZLE_INNER = 0.22
NOZZLE_TOP = 0.05
NOZZLE_SEGMENTS = 24


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(key: str, roughness: float, metallic: float = 0.0):
    """Principled BSDF named after palette key `key`, with its base colour from palette.json."""
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba(key)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_box(bm, lo, hi) -> None:
    """An axis-aligned box from Blender-space corner `lo` to `hi`, into `bm`."""
    verts = [
        bm.verts.new((hi[0] if i & 1 else lo[0], hi[1] if i & 2 else lo[1], hi[2] if i & 4 else lo[2]))
        for i in range(8)
    ]
    for face in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
        bm.faces.new([verts[i] for i in face])


def make_object(name: str, bm, mat) -> bpy.types.Object:
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_bed(mat) -> None:
    bm = bmesh.new()
    corners = [(-BED_HALF, -BED_HALF), (BED_HALF, -BED_HALF), (BED_HALF, BED_HALF), (-BED_HALF, BED_HALF)]
    bm.faces.new([bm.verts.new((x, y, BED_LIFT)) for x, y in corners])
    make_object("bed", bm, mat)


def build_grate(mat) -> None:
    bm = bmesh.new()
    o, i = FRAME_HALF, FRAME_HALF - FRAME_BAR
    add_box(bm, (-o, -o, 0), (o, -i, GRATE_TOP))  # south
    add_box(bm, (-o, i, 0), (o, o, GRATE_TOP))  # north
    add_box(bm, (-o, -i, 0), (-i, i, GRATE_TOP))  # west
    add_box(bm, (i, -i, 0), (o, i, GRATE_TOP))  # east
    # East-west bars, so the camera (looking north) sees the bed between them.
    for k in range(-2, 3):
        y = k * BAR_PITCH
        add_box(bm, (-i, y - BAR_WIDTH / 2, 0), (i, y + BAR_WIDTH / 2, GRATE_TOP - 0.01))
    make_object("grate", bm, mat)


def build_nozzle(mat) -> None:
    bm = bmesh.new()
    rings = []
    for r, z in ((NOZZLE_OUTER, 0.0), (NOZZLE_OUTER, NOZZLE_TOP), (NOZZLE_INNER, NOZZLE_TOP), (NOZZLE_INNER, BED_LIFT)):
        rings.append([
            bm.verts.new((r * math.cos(a), r * math.sin(a), z))
            for a in (2 * math.pi * s / NOZZLE_SEGMENTS for s in range(NOZZLE_SEGMENTS))
        ])
    for lower, upper in zip(rings, rings[1:]):
        for s in range(NOZZLE_SEGMENTS):
            t = (s + 1) % NOZZLE_SEGMENTS
            bm.faces.new((lower[s], lower[t], upper[t], upper[s]))
    make_object("nozzle", bm, mat)


def build_flame() -> None:
    reset_scene()
    build_bed(material("EMBER_DARK", roughness=1.0))
    build_grate(material("SHADOW", roughness=0.55, metallic=1.0))
    build_nozzle(material("STONE_DARK", roughness=0.9))
    export_glb(OUT)


def main() -> None:
    build_flame()


if __name__ == "__main__":
    main()

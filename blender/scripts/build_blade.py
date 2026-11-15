"""Procedurally build the steel blade and its stone lintels → public/models/hazards/blade.glb.

The contract is src/render/blade-kit.ts (checked by tests/unit/blade-glb.test.ts): nodes
`head`, `haft`, `axle`, `lintel_0`, `lintel_1`, each modelled in place in its own frame
(object transforms stay identity). Slice ticket 13, ADR 0001 (steel reservation) and
ADR 0002 (the blade kills on contact with this outline).

  * head: the crescent from src/core/blade-shape.json (lib/blade.py, the outline the core
    contact rule tests), extruded ±halfThickness, with the cutting edge chamfered to a
    bevelled edge (the silhouette, and so the outline, is unchanged). Head-local frame.
  * haft: an octagonal steel bar from the axle hub down into the head. Pivot-local frame.
  * axle: a steel pin between the lintels at the pivot height. Blade frame.
  * lintel_0 / lintel_1: STONE_DARK beams on the wall tops, one each side of the swing
    plane, bridging the corridor onto both slotted wall tiles. Blade frame.

Materials: `steel` (STEEL_LIGHT base, STEEL scratches and STEEL_DARK grime, metal 1,
roughness 0.3–0.45) and `stone` (STONE_DARK, mottled toward SHADOW), Principled BSDF with
palette inputs only, each baked in Cycles into its own base colour, ORM (baked AO) and
normal maps at 128 px/m: the chamber kit's texture slots, so they share its program. All export goes through lib/gltf.export_glb.

Frames: three.js (x, y, z) is Blender (x, -z, y) (export_yup). The blade frame is x along
the swing plane, y up from the floor, z off the plane.

Run: pnpm assets:build (runs every build_*.py)
"""

import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

from lib.bake import (  # noqa: E402
    baked_material,
    bake_set,
    bump,
    mix_colour,
    noise,
    palette_rgb,
    ramp,
    threshold,
    unwrap,
)
from lib.blade import ARM, HALF_THICKNESS, PIVOT_HEIGHT, head_ring, outer_count  # noqa: E402
from lib.gltf import export_glb  # noqa: E402
from lib.kit import SLOT_WIDTH, TILE_SIZE, WALL_HEIGHT  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "hazards" / "blade.glb"

TEXELS_PER_M = 128
STEEL_ATLAS = 512
STONE_ATLAS = 512
AO_DISTANCE = 0.2

EDGE_BEVEL = 0.035  # the cutting edge's chamfer, on each face (half thickness is 0.05)
HAFT_RADIUS = 0.045
HAFT_INTO_HEAD = 0.12  # the haft ends this far above the head's origin, inside the head
HUB_RADIUS = 0.1
HUB_HALF = 0.07  # off the plane; still well inside the lintels' gap
AXLE_RADIUS = 0.05
LINTEL_INNER = SLOT_WIDTH / 2 - 0.01  # just over the slot's edge, on the cap
LINTEL_WIDTH = 0.26
LINTEL_HEIGHT = 0.36
LINTEL_HALF_LENGTH = TILE_SIZE / 2 + 0.6  # the corridor, plus 0.6 m onto each wall top
LINTEL_BEVEL = 0.03
AXLE_HALF = LINTEL_INNER + LINTEL_WIDTH / 2  # ends mid-lintel


def B(x: float, y: float, z: float) -> tuple[float, float, float]:
    """three.js (x, y, z) → Blender (x, -z, y)."""
    return (x, -z, y)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_object(name: str, bm) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --- geometry ------------------------------------------------------------------------


def head_bmesh():
    """The outline ring extruded ±HALF_THICKNESS, its outer (cutting) edge chamfered."""
    ring = head_ring()
    n = len(ring)
    bm = bmesh.new()
    front = [bm.verts.new(B(x, y, HALF_THICKNESS)) for x, y in ring]
    back = [bm.verts.new(B(x, y, -HALF_THICKNESS)) for x, y in ring]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], back[i], back[j], front[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    outer = outer_count()
    edge_verts = set(front[:outer]) | set(back[:outer])
    edges = [
        e for e in bm.edges
        if all(v in edge_verts for v in e.verts)
        and any(v in front for v in e.verts) == all(v in front for v in e.verts)
    ]
    bmesh.ops.bevel(bm, geom=edges, offset=EDGE_BEVEL, segments=1, profile=0.5,
                    affect="EDGES", clamp_overlap=True)
    return bm


def cylinder(bm, radius: float, length: float, segments: int, matrix: Matrix) -> None:
    """A capped cylinder along Blender Z, centred, then moved by `matrix`."""
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=length, matrix=matrix)


def haft_bmesh():
    """Pivot-local: the hub on the axle, and an octagonal bar down into the head."""
    bm = bmesh.new()
    top, bottom = 0.0, -ARM + HAFT_INTO_HEAD
    # Blender Z is three's y: the bar runs along it.
    cylinder(bm, HAFT_RADIUS, top - bottom, 8,
             Matrix.Translation((0, 0, (top + bottom) / 2)) @ Matrix.Rotation(math.pi / 8, 4, "Z"))
    # The hub's axis is three's z (Blender -y).
    cylinder(bm, HUB_RADIUS, 2 * HUB_HALF, 16, Matrix.Rotation(math.pi / 2, 4, "X"))
    return bm


def axle_bmesh():
    bm = bmesh.new()
    cylinder(bm, AXLE_RADIUS, 2 * AXLE_HALF, 16,
             Matrix.Translation(B(0, PIVOT_HEIGHT, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    return bm


def lintel_bmesh(side: int):
    """A bevelled beam on the wall tops, beside the swing plane (`side` −1 or +1)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    z0, z1 = sorted((side * LINTEL_INNER, side * (LINTEL_INNER + LINTEL_WIDTH)))
    lo = B(-LINTEL_HALF_LENGTH, WALL_HEIGHT, z1)
    hi = B(LINTEL_HALF_LENGTH, WALL_HEIGHT + LINTEL_HEIGHT, z0)
    for v in bm.verts:
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=LINTEL_BEVEL, segments=1, profile=0.5,
                    affect="EDGES", clamp_overlap=True)
    return bm


# --- source materials (baked, never exported) ----------------------------------------


def _source(name: str):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0  # the diffuse pass carries the colour
    coord = nodes.new("ShaderNodeTexCoord").outputs["Object"]
    return mat, nodes, links, bsdf, coord


def steel_source():
    """STEEL_LIGHT base; fine STEEL scratches and soft STEEL_DARK grime; roughness 0.3–0.45."""
    mat, nodes, links, bsdf, coord = _source("_src_steel")
    colour = ramp(nodes, [(0, "STEEL_LIGHT"), (1, "STEEL_LIGHT")]).outputs["Color"]
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (1.0, 1.0, 14.0)
    links.new(coord, stretch.inputs["Vector"])
    scratches = noise(nodes, links, 40.0, 4.0, stretch.outputs["Vector"], distortion=0.4)
    colour = mix_colour(nodes, links, colour, palette_rgb(nodes, "STEEL"),
                        threshold(nodes, links, scratches, 0.58, 0.66, 0.55))
    grime = noise(nodes, links, 5.0, 5.0, coord)
    colour = mix_colour(nodes, links, colour, palette_rgb(nodes, "STEEL_DARK"),
                        threshold(nodes, links, grime, 0.55, 0.75, 0.5))
    links.new(colour, bsdf.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["From Min"].default_value = 0.3
    rough.inputs["From Max"].default_value = 0.7
    rough.inputs["To Min"].default_value = 0.3
    rough.inputs["To Max"].default_value = 0.45
    links.new(grime, rough.inputs["Value"])
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    links.new(bump(nodes, links, scratches, 0.08, 0.002), bsdf.inputs["Normal"])
    return mat


def stone_source():
    """STONE_DARK, mottled toward SHADOW with sparse STONE_SIDE wear; rough."""
    mat, nodes, links, bsdf, coord = _source("_src_stone")
    colour = ramp(nodes, [(0, "STONE_DARK"), (1, "STONE_DARK")]).outputs["Color"]
    mottle = noise(nodes, links, 3.0, 6.0, coord)
    colour = mix_colour(nodes, links, colour, palette_rgb(nodes, "SHADOW"),
                        threshold(nodes, links, mottle, 0.45, 0.75, 0.4))
    speck = noise(nodes, links, 14.0, 3.0, coord)
    colour = mix_colour(nodes, links, colour, palette_rgb(nodes, "STONE_SIDE"),
                        threshold(nodes, links, speck, 0.62, 0.72, 0.3))
    links.new(colour, bsdf.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.85
    rough.inputs["To Max"].default_value = 0.95
    links.new(mottle, rough.inputs["Value"])
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    grain = noise(nodes, links, 22.0, 8.0, coord)
    links.new(bump(nodes, links, grain, 0.3), bsdf.inputs["Normal"])
    return mat


# --- build ---------------------------------------------------------------------------


def assign(objs, mat) -> None:
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)


def build_blade() -> None:
    reset_scene()
    steel_parts = [
        make_object("head", head_bmesh()),
        make_object("haft", haft_bmesh()),
        make_object("axle", axle_bmesh()),
    ]
    stone_parts = [make_object("lintel_0", lintel_bmesh(-1)), make_object("lintel_1", lintel_bmesh(1))]

    with tempfile.TemporaryDirectory() as tmp:
        sets = []
        for parts, source, name, px, metal in (
            (steel_parts, steel_source(), "steel", STEEL_ATLAS, 1.0),
            (stone_parts, stone_source(), "stone", STONE_ATLAS, 0.0),
        ):
            assign(parts, source)
            unwrap(parts, px, TEXELS_PER_M)
            images = bake_set(parts, source, name, px, metal, AO_DISTANCE, Path(tmp))
            sets.append((parts, source, baked_material(name, images)))
        for parts, source, mat in sets:
            assign(parts, mat)
            bpy.data.materials.remove(source)
        export_glb(OUT)


def main() -> None:
    build_blade()


if __name__ == "__main__":
    main()

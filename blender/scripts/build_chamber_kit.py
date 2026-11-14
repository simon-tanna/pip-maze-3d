"""Procedurally build the Torchlit Sandstone chamber kit and export it as one .glb.

One scene, one GLB (public/models/kit/chamber.glb) with the node names and local frames of
the contract in src/render/chamber-kit.ts (checked by tests/unit/chamber-kit.test.ts):
cap_0..2, cap_slot, face_0..2, face_slot, floor_0..4 (v2's five flagstone layouts) and
contact. Slice ticket 09, ADR 0001.

How it is made:
  1. Geometry: bevelled blocks (capstones, brick courses, flagstones) over a recessed
     mortar or grout bed. Faces stay inside the wall tile, apart from a cap lip of
     LIP_REACH (5 cm) with 45° mitred ends, so outer corners close without corner pieces.
  2. Source materials: Principled BSDF whose every colour input is a palette name. Ramps
     give per-block tone, mortar and wear; real lights do the shading. Greyscale detail
     (bump, roughness) is procedural noise: no CC0 maps are fetched, so the build needs
     no network.
  3. One shared UV atlas at TEXELS_PER_M, baked in Cycles (fixed seed, so the build is
     deterministic) into base colour, ORM (baked AO, roughness, metal) and a normal map.
  4. Every tile piece then gets the one atlas material; contact keeps its own (render
     swaps it for the multiply strip). All export goes through lib/gltf.export_glb.

Blender is Z-up and export_yup maps Blender (x, y, z) to three.js (x, z, -y), so three's
south (+z) is Blender's -y. Pixel units from v2 (48 px per tile) convert via PX.

Run: pnpm assets:build (runs every build_*.py)
"""

import math
import random
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.kit import (  # noqa: E402
    CAP_THICKNESS,
    CONTACT_LIFT,
    HALF,
    SLOT_WIDTH,
    TILE_SIZE,
    WALL_HEIGHT,
)
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "kit" / "chamber.glb"

ATLAS = 2048  # px, square
TEXELS_PER_M = 128  # ADR 0001 / art direction: 256 px per 2 m tile face
UV_PER_M = TEXELS_PER_M / ATLAS
PAD_PX = 4  # island margin in the atlas

PX = TILE_SIZE / 48  # one v2 pixel in metres
LIP_REACH = 0.05  # the cap lip's overhang past the tile edge (contract: at most 5 cm)
LIP_BOTTOM = WALL_HEIGHT - 0.14
CAP_BOTTOM = WALL_HEIGHT - CAP_THICKNESS
FACE_TOP = CAP_BOTTOM
BRICK_FRONT = -HALF  # Blender y of the face plane (three z = +HALF)
BRICK_BACK = -HALF + 0.14
MORTAR_Y = -HALF + 0.09  # the recessed bed between bricks
JOINT = 0.03  # mortar joint between bricks and capstones
FLAG_GAP = 0.025  # grout joint between flagstones
FLAG_DEPTH = 0.05
GROUT_Z = -0.03
BEVEL = 0.02
AO_DISTANCE = 0.35  # m: AO reaches into joints and under the lip, not across the tile

MAT_STONE, MAT_MORTAR, MAT_CAP, MAT_LIP, MAT_FLAG, MAT_GROUT = range(6)

# v2's capstone seams (environment.js paintWallAutotile), in px of a 48 px tile.
CAP_SEAM_X = [24, 15, 31]
CAP_SEAM_Y = [12, 20, 8]
# v2's flagstone layouts (paintFlagstone): [x, y, w, h] in px, y running south.
FLAG_LAYOUTS = [
    [[0, 0, 24, 24], [24, 0, 24, 24], [0, 24, 24, 24], [24, 24, 24, 24]],
    [[0, 0, 48, 48]],
    [[0, 0, 48, 16], [0, 16, 48, 16], [0, 32, 48, 16]],
    [[0, 0, 30, 48], [30, 0, 18, 24], [30, 24, 18, 24]],
    [[0, 0, 24, 24], [24, 0, 24, 24], [0, 24, 48, 24]],
]
# Brick courses per face variant: brick width (m) and each course's running-bond offset.
BRICK_COURSES = 4
BRICK_LAYOUTS = [
    {"width": 2 / 3, "offsets": [0, 1 / 3]},
    {"width": 1.0, "offsets": [0, 0.5]},
    {"width": 2 / 3, "offsets": [1 / 6, 1 / 2]},
]


# --- geometry ------------------------------------------------------------------------


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


AXES = {"x": 0, "y": 1, "z": 2}


def facing(f, side: str) -> bool:
    """Whether face `f` looks along `side`, one of "-x", "+x", "-y", "+y", "-z", "+z"."""
    sign = -1 if side[0] == "-" else 1
    return f.normal[AXES[side[1]]] * sign > 0.99


def add_block(bm, lo, hi, mat: int, bevel_side: str, drop: tuple[str, ...] = (),
              bevel: float = BEVEL) -> None:
    """A box from Blender-space corner `lo` to `hi` into `bm`, with the edges of the face
    looking along `bevel_side` (the side the camera sees) chamfered. `drop` removes
    faces that are never seen. Instance counts run to ~1000 per piece, so every vertex
    the chase camera can't see is left out."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    for v in tmp.verts:
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
    tmp.normal_update()
    if bevel > 0:
        front = next(f for f in tmp.faces if facing(f, bevel_side))
        bmesh.ops.bevel(
            tmp,
            geom=list(front.edges),
            offset=bevel,
            segments=1,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    tmp.normal_update()
    doomed = [f for f in tmp.faces if any(facing(f, d) for d in drop)]
    if doomed:
        bmesh.ops.delete(tmp, geom=doomed, context="FACES")
    merge(bm, tmp, mat)
    tmp.free()


def add_quad(bm, corners, mat: int) -> None:
    """A single face from four Blender-space corners (counter-clockwise seen from its front)."""
    tmp = bmesh.new()
    vs = [tmp.verts.new(c) for c in corners]
    tmp.faces.new(vs)
    merge(bm, tmp, mat)
    tmp.free()


def add_floor_quad(bm, x0: float, x1: float, y0: float, y1: float, z: float, mat: int) -> None:
    """An upward-facing rectangle at height z."""
    add_quad(bm, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], mat)


def add_south_quad(bm, x0: float, x1: float, y: float, z0: float, z1: float, mat: int) -> None:
    """A south-facing (Blender -y) rectangle in the plane y."""
    add_quad(bm, [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], mat)


def add_prism(bm, bottom, top, mat: int) -> None:
    """A closed prism from a counter-clockwise bottom outline and its matching top outline."""
    tmp = bmesh.new()
    b = [tmp.verts.new(c) for c in bottom]
    t = [tmp.verts.new(c) for c in top]
    tmp.faces.new(list(reversed(b)))
    tmp.faces.new(t)
    n = len(b)
    for i in range(n):
        j = (i + 1) % n
        tmp.faces.new([b[i], b[j], t[j], t[i]])
    merge(bm, tmp, mat)
    tmp.free()


def merge(dst, src, mat: int) -> None:
    mapping = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        nf = dst.faces.new([mapping[v] for v in f.verts])
        nf.material_index = mat


def make_object(name: str, bm, materials) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for m in materials:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def spans(x0: float, x1: float, cut: tuple[float, float] | None) -> list[tuple[float, float]]:
    """[x0, x1] minus the open interval `cut` (the blade slot), if any."""
    if cut is None or x1 <= cut[0] or x0 >= cut[1]:
        return [(x0, x1)]
    out = []
    if x0 < cut[0]:
        out.append((x0, cut[0]))
    if x1 > cut[1]:
        out.append((cut[1], x1))
    return out


SLOT = (-SLOT_WIDTH / 2, SLOT_WIDTH / 2)


def cap_bmesh(variant: int, slot: bool):
    """Capstone slabs over a mortar bed, the whole tile, top at WALL_HEIGHT.
    `slot` cuts the full-depth north–south slot through x = 0 instead of the seam."""
    bm = bmesh.new()
    j = JOINT / 2
    seam_x = CAP_SEAM_X[variant] * PX - HALF
    seam_y = HALF - CAP_SEAM_Y[variant] * PX
    if slot:
        columns = [(-HALF, SLOT[0]), (SLOT[1], HALF)]
        split_col = 0
    else:
        columns = [(-HALF, seam_x - j), (seam_x + j, HALF)]
        split_col = 1 if variant == 1 else 0
    for i, (x0, x1) in enumerate(columns):
        rows = [(-HALF, HALF)]
        if i == split_col and seam_y < HALF - 2 * PX:
            rows = [(-HALF, seam_y - j), (seam_y + j, HALF)]
        for y0, y1 in rows:
            # Sides on the tile edge are always hidden: by the next cap, or by a face's lip.
            edge = (("-x",) if x0 <= -HALF else ()) + (("+x",) if x1 >= HALF else ())
            edge += (("-y",) if y0 <= -HALF else ()) + (("+y",) if y1 >= HALF else ())
            lo, hi = (x0, y0, CAP_BOTTOM), (x1, y1, WALL_HEIGHT)
            add_block(bm, lo, hi, MAT_CAP, "+z", drop=("-z",) + edge)
    bed_z = WALL_HEIGHT - 0.08
    for x0, x1 in spans(-HALF, HALF, SLOT if slot else None):
        add_floor_quad(bm, x0, x1, -HALF, HALF, bed_z, MAT_MORTAR)
    return bm


def lip_outline(x0: float, x1: float, mitre_w: bool, mitre_e: bool, z: float):
    """The lip's plan outline (counter-clockwise from above): inner edge on the tile edge,
    outer edge LIP_REACH south, ends mitred at 45° where they meet the tile's corner."""
    y_in, y_out = -HALF, -HALF - LIP_REACH
    ox0 = x0 - LIP_REACH if mitre_w else x0
    ox1 = x1 + LIP_REACH if mitre_e else x1
    return [(ox0, y_out, z), (ox1, y_out, z), (x1, y_in, z), (x0, y_in, z)]


def face_bmesh(variant: int, slot: bool):
    """South-looking brick courses on a recessed mortar bed, floor to cap, inside the tile,
    with the cap lip on top. `slot` leaves the blade's gap through x = 0."""
    bm = bmesh.new()
    cut = SLOT if slot else None
    rng = random.Random(0xFACE + variant * 977 + (31 if slot else 0))
    layout = BRICK_LAYOUTS[variant]
    course_h = FACE_TOP / BRICK_COURSES
    j = JOINT / 2
    for c in range(BRICK_COURSES):
        z0 = c * course_h + (j if c > 0 else 0)
        z1 = (c + 1) * course_h - j
        offset = layout["offsets"][c % 2]
        w = layout["width"]
        edges = [-HALF]
        x = -HALF + (offset if offset > 0 else w)
        while x < HALF - 1e-6:
            edges.append(x)
            x += w
        edges.append(HALF)
        for k in range(len(edges) - 1):
            x0 = edges[k] + (j if k > 0 else 0)
            x1 = edges[k + 1] - (j if k < len(edges) - 2 else 0)
            front = BRICK_FRONT + rng.uniform(0, 0.015)  # worn, uneven faces stay inside
            for s0, s1 in spans(x0, x1, cut):
                if s1 - s0 < 0.05:
                    continue
                lo, hi = (s0, front, z0), (s1, BRICK_BACK, z1)
                add_block(bm, lo, hi, MAT_STONE, "-y", drop=("+y", "-z"))
    for x0, x1 in spans(-HALF, HALF, cut):
        add_south_quad(bm, x0, x1, MORTAR_Y, 0, FACE_TOP, MAT_MORTAR)
    # The cap lip: from the face plane to LIP_REACH over the floor, top flush with the cap.
    for x0, x1 in spans(-HALF, HALF, cut):
        mitre_w, mitre_e = x0 <= -HALF, x1 >= HALF
        add_prism(
            bm,
            lip_outline(x0, x1, mitre_w, mitre_e, LIP_BOTTOM),
            lip_outline(x0, x1, mitre_w, mitre_e, WALL_HEIGHT),
            MAT_LIP,
        )
    return bm


def floor_bmesh(variant: int):
    """v2's flagstone layout as bevelled slabs, tops at y = 0, over a grout bed."""
    bm = bmesh.new()
    rng = random.Random(0xF100 + variant * 7919)
    g = FLAG_GAP / 2
    for i, (px, py, pw, ph) in enumerate(FLAG_LAYOUTS[variant]):
        x0, x1 = px * PX - HALF + g, (px + pw) * PX - HALF - g
        y1, y0 = HALF - py * PX - g, HALF - (py + ph) * PX + g
        top = 0.0 if i == 0 else -rng.uniform(0, 0.008)  # settled stones; one stays at 0
        lo, hi = (x0, y0, -FLAG_DEPTH), (x1, y1, top)
        add_block(bm, lo, hi, MAT_FLAG, "+z", drop=("-z",), bevel=0.012)
    add_floor_quad(bm, -HALF, HALF, -HALF, HALF, GROUT_Z, MAT_GROUT)
    return bm


def contact_object(mat) -> bpy.types.Object:
    """Wall edge at three z = 0 (Blender y = 0), reaching back to three z = -1 (Blender y = 1).
    glTF stores v flipped, so v_blender = 1 - y gives v_gltf = y: 0 at the wall edge."""
    mesh = bpy.data.meshes.new("contact")
    corners = [(-HALF, 0.0), (HALF, 0.0), (HALF, 1.0), (-HALF, 1.0)]
    mesh.from_pydata([(x, y, CONTACT_LIFT) for x, y in corners], [], [(0, 1, 2, 3)])
    layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        x, y = corners[loop.vertex_index]
        layer.data[loop.index].uv = ((x + HALF) / TILE_SIZE, 1.0 - y)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("contact", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --- source materials (baked, never exported) ----------------------------------------


def ramp(nodes, stops: list[tuple[float, str]], interpolation: str = "LINEAR"):
    node = nodes.new("ShaderNodeValToRGB")
    cr = node.color_ramp
    cr.interpolation = interpolation
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, (pos, name) in zip(cr.elements, stops):
        el.position = pos
        el.color = rgba(name)
    return node


def mix_colour(nodes, links, a, b, fac):
    node = nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    node.blend_type = "MIX"
    links.new(fac, node.inputs["Factor"])
    links.new(a, node.inputs["A"])
    links.new(b, node.inputs["B"])
    return node.outputs["Result"]


def noise(nodes, links, scale: float, detail: float, coord):
    node = nodes.new("ShaderNodeTexNoise")
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    node.inputs["Roughness"].default_value = 0.6
    links.new(coord, node.inputs["Vector"])
    return node.outputs["Fac"]


def threshold(nodes, links, value, lo: float, hi: float, gain: float):
    """smoothstep(lo, hi, value) * gain, via Map Range."""
    node = nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHSTEP"
    node.inputs["From Min"].default_value = lo
    node.inputs["From Max"].default_value = hi
    node.inputs["To Min"].default_value = 0
    node.inputs["To Max"].default_value = gain
    links.new(value, node.inputs["Value"])
    return node.outputs["Result"]


def source_material(name: str, tones: list[tuple[float, str]], tone_span: tuple[float, float],
                    wear: str | None, grime: str | None, roughness: tuple[float, float],
                    bump: float):
    """Principled BSDF with palette colour inputs: a per-block tone from `tones` (sampled
    by each block's random-per-island value mapped into `tone_span`), mottled toward
    `grime` and worn toward `wear`. Roughness and bump are greyscale noise."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord").outputs["Object"]
    geo = nodes.new("ShaderNodeNewGeometry")

    span = nodes.new("ShaderNodeMapRange")
    span.inputs["To Min"].default_value = tone_span[0]
    span.inputs["To Max"].default_value = tone_span[1]
    links.new(geo.outputs["Random Per Island"], span.inputs["Value"])
    tone = ramp(nodes, tones)
    links.new(span.outputs["Result"], tone.inputs["Fac"])
    colour = tone.outputs["Color"]

    mottle = noise(nodes, links, 3.0, 6.0, coord)
    if grime:
        g = nodes.new("ShaderNodeRGB")
        g.outputs[0].default_value = rgba(grime)
        fac = threshold(nodes, links, mottle, 0.45, 0.75, 0.55)
        colour = mix_colour(nodes, links, colour, g.outputs[0], fac)
    if wear:
        w = nodes.new("ShaderNodeRGB")
        w.outputs[0].default_value = rgba(wear)
        speck = noise(nodes, links, 14.0, 3.0, coord)
        fac = threshold(nodes, links, speck, 0.6, 0.72, 0.45)
        colour = mix_colour(nodes, links, colour, w.outputs[0], fac)
    links.new(colour, bsdf.inputs["Base Color"])

    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = roughness[0]
    rough.inputs["To Max"].default_value = roughness[1]
    links.new(mottle, rough.inputs["Value"])
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    if bump > 0:
        grain = noise(nodes, links, 22.0, 8.0, coord)
        pits = nodes.new("ShaderNodeTexVoronoi")
        pits.inputs["Scale"].default_value = 9.0
        links.new(coord, pits.inputs["Vector"])
        height = nodes.new("ShaderNodeMath")
        height.operation = "MULTIPLY_ADD"
        links.new(pits.outputs["Distance"], height.inputs[0])
        height.inputs[1].default_value = 0.6
        links.new(grain, height.inputs[2])
        b = nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        b.inputs["Distance"].default_value = 0.01
        links.new(height.outputs["Value"], b.inputs["Height"])
        links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def source_materials():
    """Indexed by the MAT_* constants. Walls run STONE_SIDE..STONE_LIGHT (caps the
    lightest, v2's STONE > STONE_SIDE), mortar STONE_DARK; the floor stays inside
    FLOOR_DARK..FLOOR_LIGHT and well below the walls: the darkest, lowest-contrast surface."""
    return [
        source_material("src_stone", [(0, "STONE_SIDE"), (0.6, "STONE"), (1, "STONE_LIGHT")],
                        (0.0, 0.75), "SAND", "STONE_DARK", (0.85, 0.95), 0.35),
        source_material("src_mortar", [(0, "STONE_DARK"), (1, "STONE_SIDE")], (0.0, 0.25),
                        None, "SHADOW", (0.92, 0.98), 0.2),
        source_material("src_cap", [(0, "STONE"), (0.5, "STONE"), (1, "STONE_LIGHT")],
                        (0.15, 0.85), "SAND", "STONE_SIDE", (0.85, 0.93), 0.3),
        source_material("src_lip", [(0, "STONE_LIGHT"), (1, "SAND")], (0.0, 0.4),
                        None, "STONE", (0.85, 0.92), 0.25),
        source_material("src_flag", [(0, "FLOOR_DARK"), (0.5, "FLOOR"), (1, "FLOOR_LIGHT")],
                        (0.3, 0.7), None, "FLOOR_DARK", (0.88, 0.94), 0.25),
        source_material("src_grout", [(0, "FLOOR_DARK"), (1, "FLOOR_DARK")], (0.0, 1.0),
                        None, "SHADOW", (0.95, 0.98), 0.0),
    ]


# --- atlas ---------------------------------------------------------------------------


def select_only(objs) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def unwrap_atlas(objs) -> None:
    """One shared UV atlas over every tile piece at UV_PER_M, packed without rescaling."""
    for o in objs:
        o.data.uv_layers.new(name="UVMap")
    select_only(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")

    area_3d = area_uv = 0.0
    for o in objs:
        uv = o.data.uv_layers["UVMap"].data
        for poly in o.data.polygons:
            area_3d += poly.area
            pts = [uv[i].uv for i in poly.loop_indices]
            cross = sum(pts[k].x * pts[k - 1].y - pts[k - 1].x * pts[k].y for k in range(len(pts)))
            area_uv += abs(cross) / 2
    k = math.sqrt(area_3d * UV_PER_M**2 / area_uv)
    for o in objs:
        for d in o.data.uv_layers["UVMap"].data:
            d.uv = d.uv * k
    print(f"[kit] {area_3d:.1f} m² of surface → {area_3d * UV_PER_M**2:.0%} of the atlas")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(
        udim_source="CLOSEST_UDIM",
        rotate=True,
        rotate_method="CARDINAL",
        scale=False,
        margin_method="FRACTION",
        margin=PAD_PX / ATLAS,
        shape_method="AABB",
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        for d in o.data.uv_layers["UVMap"].data:
            if not (0 <= d.uv.x <= 1 and 0 <= d.uv.y <= 1):
                raise RuntimeError(f"[kit] {o.name}: UVs overflow the {ATLAS} px atlas")


def new_image(name: str, colour_space: str):
    img = bpy.data.images.new(name, ATLAS, ATLAS, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colour_space
    return img


def bake(objs, materials, img, kind: str, **kw) -> None:
    for mat in materials:
        nodes = mat.node_tree.nodes
        node = nodes.get("_bake") or nodes.new("ShaderNodeTexImage")
        node.name = "_bake"
        node.image = img
        nodes.active = node
    select_only(objs)
    bpy.ops.object.bake(type=kind, margin=PAD_PX, margin_type="EXTEND", use_clear=True, **kw)


def bake_atlas(objs, materials, tmp: Path):
    """Bake base colour, AO, roughness and tangent normals into the shared atlas. Pieces
    are spread apart first so AO comes only from each piece's own relief."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.world = bpy.data.worlds.new("bake")
    scene.world.light_settings.distance = AO_DISTANCE
    for i, o in enumerate(objs):
        o.location.x = 10.0 * i

    images = {}
    scene.cycles.samples = 4
    images["base"] = new_image("kit_base", "sRGB")
    bake(objs, materials, images["base"], "DIFFUSE", pass_filter={"COLOR"})
    images["rough"] = new_image("_kit_rough", "Non-Color")
    bake(objs, materials, images["rough"], "ROUGHNESS")
    images["normal"] = new_image("kit_normal", "Non-Color")
    bake(objs, materials, images["normal"], "NORMAL", normal_space="TANGENT")
    scene.cycles.samples = 64
    images["ao"] = new_image("_kit_ao", "Non-Color")
    bake(objs, materials, images["ao"], "AO")

    for o in objs:
        o.location.x = 0.0

    # ORM: R = baked AO, G = roughness, B = metal (0).
    n = ATLAS * ATLAS * 4
    ao = np.empty(n, dtype=np.float32)
    rough = np.empty(n, dtype=np.float32)
    images["ao"].pixels.foreach_get(ao)
    images["rough"].pixels.foreach_get(rough)
    orm = np.ones(n, dtype=np.float32)
    orm[0::4] = ao[0::4]
    orm[1::4] = rough[0::4]
    orm[2::4] = 0.0
    images["orm"] = new_image("kit_orm", "Non-Color")
    images["orm"].pixels.foreach_set(orm)

    for key in ("base", "orm", "normal"):
        img = images[key]
        img.filepath_raw = str(tmp / f"{img.name}.png")
        img.file_format = "PNG"
        img.save()
    return images


def gltf_output_group():
    """The node group the glTF exporter reads occlusion from."""
    ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def atlas_material(images):
    """The kit's one exported material: base colour, ORM and normal from the atlas."""
    mat = bpy.data.materials.new("sandstone")
    mat.use_nodes = True
    mat.use_backface_culling = True  # hidden faces are never modelled, so single-sided
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    base = nodes.new("ShaderNodeTexImage")
    base.image = images["base"]
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = images["orm"]
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    out = nodes.new("ShaderNodeGroup")
    out.node_tree = gltf_output_group()
    links.new(sep.outputs["Red"], out.inputs["Occlusion"])
    nrm = nodes.new("ShaderNodeTexImage")
    nrm.image = images["normal"]
    nmap = nodes.new("ShaderNodeNormalMap")
    links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# --- build ---------------------------------------------------------------------------


def build_chamber_kit() -> None:
    reset_scene()
    materials = source_materials()
    pieces = []
    for v in range(3):
        pieces.append(make_object(f"cap_{v}", cap_bmesh(v, slot=False), materials))
    pieces.append(make_object("cap_slot", cap_bmesh(0, slot=True), materials))
    for v in range(3):
        pieces.append(make_object(f"face_{v}", face_bmesh(v, slot=False), materials))
    pieces.append(make_object("face_slot", face_bmesh(0, slot=True), materials))
    for v in range(5):
        pieces.append(make_object(f"floor_{v}", floor_bmesh(v), materials))

    unwrap_atlas(pieces)
    with tempfile.TemporaryDirectory() as tmp:
        images = bake_atlas(pieces, materials, Path(tmp))
        for img in images.values():
            img.pack()  # the GLB embeds them; the temp dir goes away
        sandstone = atlas_material(images)
        for o in pieces:
            o.data.materials.clear()
            o.data.materials.append(sandstone)
            for poly in o.data.polygons:
                poly.material_index = 0
        for mat in materials:
            bpy.data.materials.remove(mat)

        contact_mat = bpy.data.materials.new("contact")  # render swaps in its multiply strip
        contact_mat.use_nodes = True
        bsdf = contact_mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = rgba("INK")
        contact_object(contact_mat)

        export_glb(OUT)


def main() -> None:
    build_chamber_kit()


if __name__ == "__main__":
    main()

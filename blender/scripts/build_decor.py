"""Procedurally build the chamber decor props and export them as one .glb.

One scene, one GLB (public/models/decor.glb) with the nodes of the contract in
src/render/decor.ts (checked by tests/unit/decor-glb.test.ts): `decor_bones`,
`decor_rubble`, `decor_pot` and `decor_moss`. Slice ticket 16: v2's four decor kinds
(hazard-art.js `DECOR_KINDS`), purely visual. Each node is one mesh with one flat
Principled material whose colour inputs come from the palette (BONE, STONE_SIDE, STONE,
MOSS); no lights, no textures.

Frames (three.js, after export_yup maps Blender (x, y, z) to three (x, z, -y)):
  * bones, rubble, pot: centred on their pivot in x/z, base on y = 0, inside
    PROP_RADIUS of the pivot (the view sets them a little way off the wall and turns them).
  * moss: a patch that grows on a south-facing wall. Its origin is the wall foot; it rises
    in the x/y plane just south of z = 0, MOSS_WIDTH wide and at most MOSS_HEIGHT tall,
    with a short fringe onto the floor, reaching at most MOSS_REACH south.

Builds are deterministic: the irregular shapes come from a seeded `random.Random`.

Run: pnpm assets:build (runs every build_*.py)
"""

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

OUT = MODELS_DIR / "decor.glb"

PROP_RADIUS = 0.5  # mirrored in src/render/decor.ts
MOSS_WIDTH = 1.2
MOSS_HEIGHT = 0.8
MOSS_REACH = 0.2  # how far south of the wall (z = 0) the patch and fringe reach
POT_HEIGHT = 0.55
SMOOTH_ANGLE = math.radians(40)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, colour: str, roughness: float):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba(colour)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def canonical(bm):
    """The same triangles in a fixed order: verts by position, faces by their verts, each
    face's loop starting at its lowest vert (winding kept). Frees `bm`."""
    def key(co):
        return tuple(round(c, 5) for c in co)

    order = sorted(bm.verts, key=lambda v: key(v.co))
    index = {v: i for i, v in enumerate(order)}
    faces = []
    for f in bm.faces:
        ids = [index[v] for v in f.verts]
        start = ids.index(min(ids))
        faces.append(ids[start:] + ids[:start])
    faces.sort()
    out = bmesh.new()
    verts = [out.verts.new(v.co) for v in order]
    for ids in faces:
        out.faces.new([verts[i] for i in ids])
    bm.free()
    return out


def new_object(name: str, bm, mat):
    mesh = bpy.data.meshes.new(name)
    # Triangulate, then sort verts and faces by position: some bmesh ops order their output
    # by pointer, which varies run to run, and the GLB must rebuild byte-identically.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="FIXED", ngon_method="EAR_CLIP")
    bm = canonical(bm)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=SMOOTH_ANGLE)
    return obj


def box_cm(x: float, y: float, z: float):
    """Scale matrix for a unit cube to an x × y × z centimetre box."""
    return Matrix.Diagonal((x / 100, y / 100, z / 100, 1))


def merge(bm, tmp, matrix=None) -> None:
    if matrix is not None:
        bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
    offset = {v: bm.verts.new(v.co) for v in tmp.verts}
    for f in tmp.faces:
        bm.faces.new([offset[v] for v in f.verts])
    tmp.free()


def capsule(bm, length: float, radius: float, knob: float, matrix) -> None:
    """A bone: a shaft along Blender x with a knob at each end, then `matrix`."""
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=10, radius1=radius, radius2=radius,
                          depth=length, matrix=Matrix.Rotation(math.pi / 2, 4, "Y"))
    for end in (-1, 1):
        for side in (-1, 1):
            bmesh.ops.create_uvsphere(tmp, u_segments=10, v_segments=6, radius=knob,
                                      matrix=Matrix.Translation((end * length / 2,
                                                                 side * knob * 0.55, 0)))
    merge(bm, tmp, matrix)


def build_bones(mat):
    """Two crossed long bones and a skull, lying on the floor."""
    bm = bmesh.new()
    lie = 0.05  # knob radius: the bones rest on the floor
    capsule(bm, 0.5, 0.028, lie,
            Matrix.Translation((-0.1, 0.05, lie)) @ Matrix.Rotation(0.35, 4, "Z"))
    capsule(bm, 0.42, 0.026, 0.045,
            Matrix.Translation((-0.05, -0.04, lie + 0.02)) @ Matrix.Rotation(-0.6, 4, "Z"))
    skull = bmesh.new()
    bmesh.ops.create_uvsphere(skull, u_segments=14, v_segments=10, radius=0.12)
    for v in skull.verts:
        v.co.z *= 0.85
        v.co.y *= 1.1
        if v.co.z < -0.04:  # flatten the base so it sits
            v.co.z = -0.04
    jaw = bmesh.new()
    bmesh.ops.create_cube(jaw, size=1.0,
                          matrix=Matrix.Translation((0, -0.09, -0.02)) @
                          box_cm(13, 8, 6))
    merge(skull, jaw)
    merge(bm, skull, Matrix.Translation((0.28, -0.02, 0.04)) @ Matrix.Rotation(-0.4, 4, "Z"))
    return new_object("decor_bones", bm, mat)


def build_rubble(mat, rng: random.Random):
    """Fallen blocks of chipped sandstone, the biggest against the wall."""
    bm = bmesh.new()
    chunks = [((-0.22, 0.1), 0.2), ((0.15, 0.14), 0.16), ((0.3, -0.12), 0.1),
              ((-0.05, -0.2), 0.09), ((-0.36, -0.12), 0.08), ((0.02, 0.02), 0.07)]
    for (x, y), size in chunks:
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=size)
        for v in tmp.verts:
            v.co *= rng.uniform(0.8, 1.2)
            v.co.z *= 0.7
        low = min(v.co.z for v in tmp.verts)
        for v in tmp.verts:  # flat bottom, resting on the floor
            v.co.z = max(v.co.z - low, 0.0) if v.co.z - low > 0.02 else 0.0
        merge(bm, tmp, Matrix.Translation((x, y, 0)) @
              Matrix.Rotation(rng.uniform(0, math.tau), 4, "Z"))
    return new_object("decor_rubble", bm, mat)


def build_pot(mat):
    """A lathed clay jar with a rolled lip, and a shard beside it."""
    bm = bmesh.new()
    # (radius, height) up the profile, outside then inside.
    profile = [(0.0, 0.0), (0.1, 0.0), (0.17, 0.08), (0.2, 0.22), (0.18, 0.38), (0.11, 0.48),
               (0.1, POT_HEIGHT - 0.02), (0.13, POT_HEIGHT), (0.1, POT_HEIGHT),
               (0.085, 0.47), (0.0, 0.47)]
    segments = 20
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / segments),
                            r * math.sin(2 * math.pi * i / segments), z))
              for i in range(segments)] for r, z in profile]
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    shard = bmesh.new()
    bmesh.ops.create_cube(shard, size=1.0, matrix=box_cm(12, 8, 3))
    merge(bm, shard, Matrix.Translation((0.3, -0.12, 0.015)) @ Matrix.Rotation(0.7, 4, "Z"))
    return new_object("decor_pot", bm, mat)


def build_moss(mat, rng: random.Random):
    """A ragged patch on the wall (Blender x/z, just in front of y = 0) with a floor fringe."""
    bm = bmesh.new()
    columns = 13
    rows = 6
    half = MOSS_WIDTH / 2
    tops = []
    for i in range(columns):
        t = i / (columns - 1)
        edge = math.sin(math.pi * t)  # tallest in the middle, nothing at the ends
        tops.append(MOSS_HEIGHT * edge * rng.uniform(0.45, 1.0))
    grid = []
    for i in range(columns):
        x = -half + MOSS_WIDTH * i / (columns - 1)
        col = []
        base = 0.04  # the wall rows start just above the floor; the fringe bends down to it
        top = max(tops[i], base + 0.02)
        for j in range(rows):
            z = base + (top - base) * j / (rows - 1)
            bulge = 0.012 + 0.025 * math.sin(math.pi * j / (rows - 1)) * (tops[i] / MOSS_HEIGHT)
            col.append(bm.verts.new((x, -bulge, z)))
        # The fringe: two rows creeping onto the floor, falling monotonically from the wall.
        fringe = 0.14 * (tops[i] / MOSS_HEIGHT)
        col.insert(0, bm.verts.new((x, -0.012 - fringe * 0.5, 0.024)))
        col.insert(0, bm.verts.new((x, -0.012 - fringe, 0.016)))
        grid.append(col)
    for a, b in zip(grid, grid[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:  # face south (Blender -y) and up
        if f.normal.dot(Vector((0, -1, 0.3))) < 0:
            f.normal_flip()
    obj = new_object("decor_moss", bm, mat)
    solid = obj.modifiers.new("solidify", "SOLIDIFY")
    solid.thickness = 0.012
    solid.offset = 1.0
    return obj


def build_decor() -> None:
    reset_scene()
    rng = random.Random(16)
    build_bones(material("decor_bone", "BONE", 0.75)).location.x = 0
    build_rubble(material("decor_stone", "STONE_SIDE", 0.9), rng).location.x = 1.5
    build_pot(material("decor_clay", "STONE", 0.8)).location.x = 3
    build_moss(material("decor_moss", "MOSS", 0.95), rng).location.x = 4.5
    export_glb(OUT)


if __name__ == "__main__":
    build_decor()

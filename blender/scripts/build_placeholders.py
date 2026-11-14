"""Procedurally build the placeholder chamber kit and export it as one .glb.

One scene, one GLB (public/models/placeholders/chamber.glb) with the same node names as
ticket 09's sandstone kit, so swapping kits is a file change. The contract (local frames,
which way faces look, the contact strip's UVs) is documented in src/render/chamber-kit.ts
and checked by tests/unit/chamber-kit.test.ts. Variants are duplicate meshes for now.

Blender is Z-up and export_yup maps Blender (x, y, z) to three.js (x, z, -y), so three's
south (+z) is Blender's -y.

Run: pnpm assets:placeholders (or pnpm assets:build, which runs every builder)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

TILE_SIZE = 2.0  # metres — must match TILE_SIZE in src/core/grid.ts
WALL_HEIGHT = 2.2  # metres — must match WALL_HEIGHT in src/render/chamber-kit.ts
CAP_THICKNESS = 0.2
FACE_DEPTH = 0.15  # relief stays inside the wall tile
SLOT_WIDTH = 0.4  # face_slot / cap_slot: the gap a blade spins through
CONTACT_LIFT = 0.01  # above the floor, so the strip never z-fights it

HALF = TILE_SIZE / 2


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, colour: str, roughness: float = 0.9):
    """Principled BSDF with its base colour from palette.json (`colour` is a P name)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba(colour)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def box(name: str, lo: tuple[float, float, float], hi: tuple[float, float, float], mat):
    """An axis-aligned box from Blender-space corner `lo` to `hi`, as a new object."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = lo[0] if v.co.x < 0 else hi[0]
        v.co.y = lo[1] if v.co.y < 0 else hi[1]
        v.co.z = lo[2] if v.co.z < 0 else hi[2]
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def join(name: str, parts: list) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    parts[0].data.name = name


def quad(name: str, x0: float, x1: float, y0: float, y1: float, z: float, mat, uvs=None):
    """A +z-facing quad over [x0, x1] × [y0, y1] at height z; `uvs` maps (x, y) to (u, v)."""
    mesh = bpy.data.meshes.new(name)
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    mesh.from_pydata([(x, y, z) for x, y in corners], [], [(0, 1, 2, 3)])
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            layer.data[loop.index].uv = uvs(*corners[loop.vertex_index])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_chamber_kit() -> None:
    reset_scene()
    cap_mat = material("cap", "STONE")
    face_mat = material("face", "STONE_SIDE")
    floor_mat = material("floor", "FLOOR")
    contact_mat = material("contact", "INK")  # render swaps in its multiply strip material

    cap_bottom = WALL_HEIGHT - CAP_THICKNESS
    for v in range(3):
        box(f"cap_{v}", (-HALF, -HALF, cap_bottom), (HALF, HALF, WALL_HEIGHT), cap_mat)
    # The cap of a wall tile beside a blade: the swing (head reach ~2.6 m from the pivot,
    # src/core/blade-shape.json) crosses the cap slab ~1.6 m into the tile, so the slot runs
    # the full tile depth along the swing plane (x = 0).
    slot_gap = SLOT_WIDTH / 2
    join(
        "cap_slot",
        [
            box("cap_slot", (-HALF, -HALF, cap_bottom), (-slot_gap, HALF, WALL_HEIGHT), cap_mat),
            box("_cap_slot_e", (slot_gap, -HALF, cap_bottom), (HALF, HALF, WALL_HEIGHT), cap_mat),
        ],
    )

    # Faces look south: three's +z is Blender's -y, so they hug y = -HALF.
    face_top = WALL_HEIGHT - CAP_THICKNESS
    for v in range(3):
        box(f"face_{v}", (-HALF, -HALF, 0), (HALF, -HALF + FACE_DEPTH, face_top), face_mat)
    gap = SLOT_WIDTH / 2
    join(
        "face_slot",
        [
            box("face_slot", (-HALF, -HALF, 0), (-gap, -HALF + FACE_DEPTH, face_top), face_mat),
            box("_slot_e", (gap, -HALF, 0), (HALF, -HALF + FACE_DEPTH, face_top), face_mat),
        ],
    )

    for v in range(5):
        quad(f"floor_{v}", -HALF, HALF, -HALF, HALF, 0.0, floor_mat)

    # Wall edge at three z = 0 (Blender y = 0), reaching back to three z = -1 (Blender y = 1).
    # glTF stores v flipped (v_gltf = 1 - v_blender), so v_blender = 1 - y gives v_gltf = y:
    # 0 at the wall edge, 1 at the far edge.
    quad(
        "contact",
        -HALF,
        HALF,
        0.0,
        1.0,
        CONTACT_LIFT,
        contact_mat,
        uvs=lambda x, y: ((x + HALF) / TILE_SIZE, 1.0 - y),
    )

    export_glb(MODELS_DIR / "placeholders" / "chamber.glb")


def main() -> None:
    build_chamber_kit()


if __name__ == "__main__":
    main()

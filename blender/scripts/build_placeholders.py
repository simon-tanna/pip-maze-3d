"""Procedurally build placeholder maze pieces and export them as .glb.

Proves the bpy → glb → three.js pipeline before any real art exists. Each piece is
built in a fresh scene, centred on the origin, sized to TILE_SIZE (keep in sync with
src/core/grid.ts), and exported to public/models/placeholders/<name>.glb.

Run: pnpm assets:placeholders (or pnpm assets:build, which runs every builder)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from lib.gltf import export_glb  # noqa: E402
from lib.palette import rgba  # noqa: E402
from lib.paths import MODELS_DIR  # noqa: E402

TILE_SIZE = 2.0  # metres — must match TILE_SIZE in src/core/grid.ts
WALL_HEIGHT = 3.0


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


def build_wall() -> None:
    reset_scene()
    # Blender is Z-up; the base sits on z=0 so it stands on the floor after Y-up export.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, WALL_HEIGHT / 2))
    wall = bpy.context.active_object
    wall.name = "wall"
    wall.scale = (TILE_SIZE, TILE_SIZE, WALL_HEIGHT)
    bpy.ops.object.transform_apply(scale=True)
    wall.data.materials.append(material("sandstone", "STONE"))
    export_glb(MODELS_DIR / "placeholders" / "wall.glb")


def build_floor() -> None:
    reset_scene()
    bpy.ops.mesh.primitive_plane_add(size=TILE_SIZE, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "floor"
    floor.data.materials.append(material("flagstone", "FLOOR"))
    export_glb(MODELS_DIR / "placeholders" / "floor.glb")


def main() -> None:
    build_wall()
    build_floor()


if __name__ == "__main__":
    main()

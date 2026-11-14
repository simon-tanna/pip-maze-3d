"""Look-dev renders of Pip (m1 ticket 11): a turnaround and a shot from the game camera.

Builds Pip with build_pip.build() and renders, with EEVEE and the Khronos PBR Neutral view
transform (the game's NeutralToneMapping):
  * <prefix>-front / -three-quarter / -side / -back: a studio turnaround on CREAM, lit by
    a SAND key from the upper left, an AMBIENT world fill and nothing warm;
  * <prefix>-walk: one walk cycle side-on, every other frame, left to right;
  * <prefix>-game: the full 1920x1080 frame from the in-game camera (look.camera: 7 m
    back, 15.7 m up, 57 deg vertical fov, so about a 66 deg pitch) over a FLOOR plane,
    lit like the chamber: a SAND key from the north-west at 57.5 deg, an AMBIENT /
    FLOOR_DARK hemisphere, and the FIRE_HOT torch 1.6 m up, 0.5 m south of Pip;
  * <prefix>-game-zoom: Pip's pixels from that frame, cropped and enlarged 4x (nearest),
    so the face can be judged at game scale.

Light values mirror src/render/look/lights.ts by hand (Blender can't import TS); they are
an approximation for comparing iterations, not a substitute for the in-game view.

Run: pnpm assets:render <out_dir> <prefix>   (e.g. docs/art/m1 11-iter2)
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

from build_pip import build  # noqa: E402
from lib.palette import rgb, rgba  # noqa: E402

# Turnaround yaw of Pip (degrees about +Z) per shot; the camera stays on the -Y side.
TURNAROUND = {"front": 0.0, "three-quarter": 35.0, "side": 90.0, "back": 180.0}
SHOTS = (*TURNAROUND, "walk", "game", "game-zoom")
WALK_FRAMES = range(0, 16, 2)  # one cycle of the 16-frame walk, every other frame

# look.camera and look.lights defaults (src/render/look/*.ts).
CAMERA_BACK, CAMERA_UP, CAMERA_FOV_DEG = 7.0, 15.7, 57.0
GAME_PITCH_DEG = math.degrees(math.atan2(CAMERA_UP, CAMERA_BACK))
KEY_LUX, KEY_ELEVATION_DEG = 2.2, 57.5
HEMI, ENV = 0.6, 0.25
TORCH_CD, TORCH_HEIGHT, TORCH_SOUTH, TORCH_DISTANCE = 6.0, 1.6, 0.9, 9.0
ZOOM = 4


def _srgb(name: str) -> np.ndarray:
    lin = np.array(rgb(name))
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)


def _engine(scene, scale: float, samples: int) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_shadows = True
    scene.render.resolution_percentage = max(1, round(scale * 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.render.film_transparent = True


def _world(scene, sky: str, ground: str, strength: float) -> None:
    """A two-colour gradient world: `sky` above the horizon, `ground` below (a hemisphere)."""
    world = bpy.data.worlds.new("look")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = rgba(ground)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = rgba(sky)
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], remap.inputs["Value"])
    nt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def _light(name: str, kind: str, colour: str, energy: float, location, rotation=None):
    data = bpy.data.lights.new(name, kind)
    data.color = rgb(colour)
    data.energy = energy
    if kind == "SUN":
        data.angle = math.radians(3.0)  # soft enough to hide shadow-map stair-steps
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    if rotation is not None:
        obj.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _sun_rotation(azimuth_deg: float, elevation_deg: float):
    """Rotation for a sun placed at `azimuth` (degrees from +Y, positive toward +X) and
    `elevation` above the horizon, shining at the origin."""
    direction = Vector(
        (
            math.cos(math.radians(elevation_deg)) * math.sin(math.radians(azimuth_deg)),
            math.cos(math.radians(elevation_deg)) * math.cos(math.radians(azimuth_deg)),
            math.sin(math.radians(elevation_deg)),
        )
    )
    # A sun shines down its local -Z; point -Z away from the light's position.
    return (-direction).to_track_quat("-Z", "Y").to_euler()


def _camera(name: str, location, target, fov_deg: float):
    data = bpy.data.cameras.new(name)
    data.sensor_fit = "VERTICAL"
    data.angle_y = math.radians(fov_deg)
    data.clip_start, data.clip_end = 0.1, 200.0
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _composite(path: Path, backdrop: str) -> None:
    """Flatten the transparent render over a palette backdrop (in display space)."""
    img = bpy.data.images.load(str(path))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + _srgb(backdrop) * (1 - a)
    px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def _pip_bounds_ndc(scene, cam, mesh) -> tuple[float, float, float, float]:
    """Pip's projected bounds in camera-normalised coords (0..1, y up)."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    data = ev.to_mesh()
    pts = [world_to_camera_view(scene, cam, ev.matrix_world @ v.co) for v in data.vertices]
    ev.to_mesh_clear()
    xs, ys = [p.x for p in pts], [p.y for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _zoom(src: Path, dst: Path, bounds, margin: float = 0.25) -> None:
    img = bpy.data.images.load(str(src))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)  # rows run bottom-up
    x0, y0, x1, y1 = bounds
    mx, my = (x1 - x0) * margin, (y1 - y0) * margin
    c0, c1 = max(0, int((x0 - mx) * w)), min(w, int(math.ceil((x1 + mx) * w)))
    r0, r1 = max(0, int((y0 - my) * h)), min(h, int(math.ceil((y1 + my) * h)))
    crop = px[r0:r1, c0:c1].repeat(ZOOM, axis=0).repeat(ZOOM, axis=1)
    bpy.data.images.remove(img)
    out = bpy.data.images.new("zoom", crop.shape[1], crop.shape[0], alpha=True)
    out.pixels.foreach_set(np.ascontiguousarray(crop).ravel())
    out.filepath_raw = str(dst)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)


def _tile(paths: list[Path], dst: Path) -> None:
    """Lay same-sized images out left to right in one PNG, then delete the parts."""
    tiles = []
    for path in paths:
        img = bpy.data.images.load(str(path))
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        tiles.append(px.reshape(h, w, 4))
        bpy.data.images.remove(img)
        path.unlink()
    strip = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new("strip", strip.shape[1], strip.shape[0], alpha=True)
    out.pixels.foreach_set(np.ascontiguousarray(strip).ravel())
    out.filepath_raw = str(dst)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)


def _render(scene, cam, path: Path) -> None:
    scene.camera = cam
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_all(out_dir: Path, prefix: str, *, scale: float = 1.0, samples: int = 32) -> dict:
    """Render every shot in SHOTS to out_dir/<prefix>-<shot>.png; returns measurements."""
    out_dir.mkdir(parents=True, exist_ok=True)
    arm, mesh = build()
    scene = bpy.context.scene
    scene.frame_set(0)
    _engine(scene, scale, samples)

    # Turnaround: studio light, Pip turns on the spot, the camera holds.
    scene.render.resolution_x, scene.render.resolution_y = 768, 1024
    _world(scene, "AMBIENT", "AMBIENT", 1.2)
    key = _light("key", "SUN", "KEY", 4.5, (0, 0, 10), _sun_rotation(-140.0, 50.0))
    # No studio shadows: EEVEE's shadow terminator stair-steps every bevel at this size.
    key.data.use_shadow = False
    cam = _camera("turntable", [0.0, -6.0, 1.3], [0.0, 0.0, 0.76], 16.0)
    for shot, yaw in TURNAROUND.items():
        arm.rotation_euler = (0.0, 0.0, math.radians(yaw))
        path = out_dir / f"{prefix}-{shot}.png"
        _render(scene, cam, path)
        _composite(path, "CREAM")

    # Walk strip: one cycle side-on, frames left to right, on the same backdrop.
    arm.rotation_euler = (0.0, 0.0, math.radians(TURNAROUND["side"]))
    idle = arm.animation_data.action
    arm.animation_data.action = bpy.data.actions["walk"]
    scene.render.resolution_x, scene.render.resolution_y = 384, 512
    frames = []
    for f in WALK_FRAMES:
        scene.frame_set(f)
        path = out_dir / f"{prefix}-walk-{f:02d}.png"
        _render(scene, cam, path)
        _composite(path, "CREAM")
        frames.append(path)
    _tile(frames, out_dir / f"{prefix}-walk.png")
    arm.animation_data.action = idle
    scene.frame_set(0)
    arm.rotation_euler = [0.0, 0.0, 0.0]
    bpy.data.objects.remove(key)

    # Game camera: the chamber rig over a FLOOR plane.
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.film_transparent = False
    _world(scene, "AMBIENT", "FLOOR_DARK", HEMI + ENV)
    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0, 0, 0))
    floor = bpy.context.active_object
    mat = bpy.data.materials.new("FLOOR")
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = rgba("FLOOR")
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(mat)
    # North-west key: three's north is -z, which is Blender +Y; west is -X.
    _light("key", "SUN", "KEY", KEY_LUX, (0, 0, 10), _sun_rotation(-45.0, KEY_ELEVATION_DEG))
    torch = _light("torch", "POINT", "TORCH", TORCH_CD * 4 * math.pi, (0, -TORCH_SOUTH, TORCH_HEIGHT))
    torch.data.shadow_soft_size = 0.05
    torch.data.use_custom_distance = True
    torch.data.cutoff_distance = TORCH_DISTANCE
    cam = _camera("game", [0.0, -CAMERA_BACK, CAMERA_UP], [0.0, 0.0, 0.0], CAMERA_FOV_DEG)
    game = out_dir / f"{prefix}-game.png"
    _render(scene, cam, game)
    bounds = _pip_bounds_ndc(scene, cam, mesh)
    _zoom(game, out_dir / f"{prefix}-game-zoom.png", bounds)
    return {"game_height_px_1080": (bounds[3] - bounds[1]) * 1080}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) != 2:
        raise SystemExit("usage: pnpm assets:render <out_dir> <prefix>")
    report = render_all(Path(argv[0]), argv[1])
    print(f"[render] Pip is {report['game_height_px_1080']:.0f} px tall at 1080p")

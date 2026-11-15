"""Bake helpers for procedural assets: palette-input source materials baked in Cycles into
a texture set (base colour + ORM with baked AO), the art direction's kit-material recipe
(ADR 0001). Used by build_blade.py; build_chamber_kit.py predates it and keeps its own
copy (it also bakes a normal map, over a 2048² atlas).

Every colour input is a palette name (lib.palette). Bakes use a fixed Cycles seed on the
CPU, so a rebuild is deterministic.
"""

import math
from pathlib import Path

import bpy
import numpy as np

from lib.palette import rgba

PAD_PX = 4  # island margin and bake margin, px


# --- source-material nodes -----------------------------------------------------------


def ramp(nodes, stops: list[tuple[float, str]]):
    node = nodes.new("ShaderNodeValToRGB")
    cr = node.color_ramp
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


def noise(nodes, links, scale: float, detail: float, coord, distortion: float = 0.0):
    node = nodes.new("ShaderNodeTexNoise")
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    node.inputs["Roughness"].default_value = 0.6
    node.inputs["Distortion"].default_value = distortion
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


def bump(nodes, links, height, strength: float, distance: float = 0.01):
    node = nodes.new("ShaderNodeBump")
    node.inputs["Strength"].default_value = strength
    node.inputs["Distance"].default_value = distance
    links.new(height, node.inputs["Height"])
    return node.outputs["Normal"]


def palette_rgb(nodes, name: str):
    node = nodes.new("ShaderNodeRGB")
    node.outputs[0].default_value = rgba(name)
    return node.outputs[0]


# --- atlas ---------------------------------------------------------------------------


def select_only(objs) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def unwrap(objs, atlas_px: int, texels_per_m: float) -> None:
    """One shared UV atlas over `objs` at `texels_per_m`, packed without rescaling."""
    uv_per_m = texels_per_m / atlas_px
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
    k = math.sqrt(area_3d * uv_per_m**2 / area_uv)
    for o in objs:
        for d in o.data.uv_layers["UVMap"].data:
            d.uv = d.uv * k

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(
        udim_source="CLOSEST_UDIM",
        rotate=True,
        rotate_method="CARDINAL",
        scale=False,
        margin_method="FRACTION",
        margin=PAD_PX / atlas_px,
        shape_method="AABB",
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        for d in o.data.uv_layers["UVMap"].data:
            if not (0 <= d.uv.x <= 1 and 0 <= d.uv.y <= 1):
                raise RuntimeError(f"[bake] {o.name}: UVs overflow the {atlas_px} px atlas")
    print(f"[bake] {area_3d:.2f} m² → {area_3d * uv_per_m**2:.0%} of a {atlas_px} px atlas")


def _image(name: str, px: int, colour_space: str):
    img = bpy.data.images.new(name, px, px, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colour_space
    return img


def _bake(objs, material, img, kind: str, **kw) -> None:
    nodes = material.node_tree.nodes
    node = nodes.get("_bake") or nodes.new("ShaderNodeTexImage")
    node.name = "_bake"
    node.image = img
    nodes.active = node
    select_only(objs)
    bpy.ops.object.bake(type=kind, margin=PAD_PX, margin_type="EXTEND", use_clear=True, **kw)


def bake_set(objs, material, name: str, px: int, metal: float, ao_distance: float,
             tmp: Path) -> dict:
    """Bake `material` (metallic 0 in the source, so the diffuse pass carries the colour)
    over `objs` into `<name>_base`, `<name>_orm` (R baked AO, G roughness, B `metal`) and a
    tangent-space `<name>_normal`: the chamber kit atlas's texture slots, so a baked
    material shares its shader program.
    Objects are spread apart first so AO comes only from each object's own relief."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("bake")
    scene.world.light_settings.distance = ao_distance
    home = [o.location.copy() for o in objs]
    for i, o in enumerate(objs):
        o.location.x += 10.0 * (i + 1)

    scene.cycles.samples = 4
    base = _image(f"{name}_base", px, "sRGB")
    _bake(objs, material, base, "DIFFUSE", pass_filter={"COLOR"})
    rough = _image(f"_{name}_rough", px, "Non-Color")
    _bake(objs, material, rough, "ROUGHNESS")
    normal = _image(f"{name}_normal", px, "Non-Color")
    _bake(objs, material, normal, "NORMAL", normal_space="TANGENT")
    scene.cycles.samples = 64
    ao = _image(f"_{name}_ao", px, "Non-Color")
    _bake(objs, material, ao, "AO")
    for o, loc in zip(objs, home):
        o.location = loc

    n = px * px * 4
    a = np.empty(n, dtype=np.float32)
    r = np.empty(n, dtype=np.float32)
    ao.pixels.foreach_get(a)
    rough.pixels.foreach_get(r)
    orm_px = np.ones(n, dtype=np.float32)
    orm_px[0::4] = a[0::4]
    orm_px[1::4] = r[0::4]
    orm_px[2::4] = metal
    orm = _image(f"{name}_orm", px, "Non-Color")
    orm.pixels.foreach_set(orm_px)

    images = {"base": base, "orm": orm, "normal": normal}
    for img in images.values():
        img.filepath_raw = str(tmp / f"{img.name}.png")
        img.file_format = "PNG"
        img.save()
        img.pack()  # the GLB embeds them; the temp dir goes away
    return images


def _gltf_output_group():
    """The node group the glTF exporter reads occlusion from."""
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def baked_material(name: str, images: dict):
    """An exported material from a `bake_set`: base colour, ORM (AO, roughness, metal) and
    the tangent-space normal map."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed or hidden-side-dropped meshes: single-sided
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
    out.node_tree = _gltf_output_group()
    links.new(sep.outputs["Red"], out.inputs["Occlusion"])
    nrm = nodes.new("ShaderNodeTexImage")
    nrm.image = images["normal"]
    nmap = nodes.new("ShaderNodeNormalMap")
    links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

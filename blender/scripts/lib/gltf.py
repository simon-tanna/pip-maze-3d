"""glTF export settings, kept in one place so hand-made and generated assets export identically."""

from pathlib import Path

import bpy

from lib.palette import names, rgba

# The clips a character must export, exactly (3d-slice ticket 06's character contract).
CHARACTER_CLIPS = ("idle", "walk")


class ExportContractError(RuntimeError):
    """A skinned export broke the character contract; nothing was written."""


def export_glb(
    out_path: Path,
    *,
    profile: str = "static",
    clips: tuple[str, ...] = CHARACTER_CLIPS,
) -> None:
    """Export the current scene to a .glb that three.js GLTFLoader can read directly.

    Conventions (see CLAUDE.md "Blender conventions"):
      * 1 Blender unit = 1 metre = 1 three.js unit.
      * Blender is Z-up; export_yup converts to three.js Y-up.
      * Modifiers are applied, except Armature modifiers (the exporter skips those), so
        shape keys are not exported. Objects prefixed with "_" are skipped (helpers, cutters).

    `profile="skinned"` is for a rigged character (docs: m1 ticket 10). It checks the
    contract first and raises ExportContractError on: not exactly one armature, a hidden
    armature, an armature with no animation data, an action without a fake user, action
    names other than exactly `clips`, or a material not named after a palette colour. It
    then rewrites each material's Base Color from palette.json and exports every action as
    a clip (ACTIONS mode, slid to t = 0) with deform bones only and 4 influences per vertex.
    """
    if profile not in ("static", "skinned"):
        raise ValueError(f"export_glb: unknown profile {profile!r}")

    for obj in bpy.data.objects:
        if obj.name.startswith("_"):
            obj.hide_set(True)
            obj.hide_render = True

    skinned: dict = {}
    if profile == "skinned":
        _check_character(clips)
        _apply_palette()
        skinned = dict(
            export_animation_mode="ACTIONS",
            export_anim_single_armature=True,  # every action with bone keys → one clip each
            export_anim_slide_to_zero=True,  # clips start at t = 0, so loops don't hitch
            export_reset_pose_bones=True,
            export_force_sampling=True,
            export_optimize_animation_size=True,
            export_skins=True,
            export_influence_nb=4,  # three reads JOINTS_0/WEIGHTS_0 only
            export_all_influences=False,
            export_def_bones=True,  # drop control/IK bones
            export_rest_position_armature=True,
            export_leaf_bone=False,
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        use_visible=True,
        export_animations=True,
        export_extras=True,  # custom properties → userData (e.g. hazard type tags)
        **skinned,
    )
    print(f"[export] {out_path}")


def has_armature() -> bool:
    """True when the scene holds an exportable armature (export_all picks the profile)."""
    return any(o.type == "ARMATURE" and not o.name.startswith("_") for o in bpy.data.objects)


def _fail(message: str) -> None:
    raise ExportContractError(f"[export] character contract: {message}")


def _check_character(clips: tuple[str, ...]) -> None:
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE" and not o.name.startswith("_")]
    if len(armatures) != 1:
        _fail(f"expected exactly one armature, found {len(armatures)}")
    arm = armatures[0]
    if not arm.visible_get():
        _fail(f"armature {arm.name!r} is hidden (use_visible would drop it)")
    if arm.animation_data is None:
        _fail(f"armature {arm.name!r} has no animation data, so no clip would export")

    actions = list(bpy.data.actions)
    lost = sorted(a.name for a in actions if not a.use_fake_user)
    if lost:
        _fail(f"actions without a fake user (lost on save): {lost}")
    found = sorted(a.name for a in actions)
    if found != sorted(clips):
        _fail(f"clips must be exactly {sorted(clips)}, found {found}")

    palette = set(names())
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("_"):
            continue
        for slot in obj.material_slots:
            if slot.material is None or slot.material.name not in palette:
                name = slot.material.name if slot.material else None
                _fail(f"{obj.name}: material slot {name!r} is not a palette colour")


def _apply_palette() -> None:
    """Every slot's Base Color comes from palette.json: the slot name is the colour."""
    for mat in bpy.data.materials:
        if mat.users == 0 or mat.node_tree is None:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Base Color"].default_value = rgba(mat.name)

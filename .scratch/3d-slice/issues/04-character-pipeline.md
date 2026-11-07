# How does a rigged, animated character get from Blender 5.2 to three r187 via glTF?

Type: research
Status: resolved
Blocked by:

## Question

What is the working pipeline for a skinned character with idle and walk (later hit and die) actions, from Blender 5.2 LTS through glTF/GLB into three.js r187? Cover: armature and action export settings in Blender 5.2's glTF exporter (NLA tracks vs actions, 'export all actions', bone limits, applying modifiers on skinned meshes); how this fits the repo's `blender/scripts/lib/gltf.export_glb` (it applies modifiers, which can conflict with armatures); loading in three via GLTFLoader + `SkeletonUtils.clone` + AnimationMixer crossfades; and whether a Mixamo / Rigify path or a simple hand rig is cheapest for a stylised character. Produce a recommended pipeline and any changes `export_glb` needs.

## Answer

Full findings: `docs/research/character-pipeline.md` on branch `research/character-pipeline` (local only, never merged). The subagent checked them against Blender 5.2.3's exporter source and three r187, then ran a bpy script that built a rig, exported it through the unchanged `export_glb`, and loaded the GLB with three r187 in Node.

- **Rig**: a bpy-scripted hand rig of about 12–16 bones, rigidly weighted for low-poly parts. Rigify is overkill. Mixamo can't be scripted, needs FBX round-trips, and its realistic motion doesn't suit grid-snap movement. Name bones `leg_L`, not `leg.L`, because three strips dots and colons.
- **Export**: the default `ACTIONS` mode with "Export all Armature Actions" turns each action into a clip named after it. This requires exactly one armature, and that armature needs `animation_data`. Every action needs `use_fake_user=True`, or it's lost on save. `export_anim_slide_to_zero=True` stops clips starting 1/24 s late. Blender 5.x slotted actions mean bpy code goes through the `bpy_extras.anim_utils` channelbag helpers, not `Action.fcurves`.
- **`export_glb`**: applying modifiers is safe, because the exporter turns off Armature modifiers while applying the rest. The only cost is that shape keys are dropped. Add a skinned profile that pins `export_def_bones=True` and `export_influence_nb=4`, and fails the export on: more than one armature, a hidden rig, a missing fake user, or unexpected clip names.
- **`models.ts`**: the current `Object3D.clone` leaves a skinned clone bound to the original's skeleton. Add `loadCharacter()`, which caches the GLTF and returns `{ root: SkeletonUtils.clone(scene), clips }`. Import with `import { clone } from 'three/addons/utils/SkeletonUtils.js'` (named exports only).
- **Playback**: look clips up with `AnimationClip.findByName` and crossfade over about 0.1 s. Call `reset()` before fading back in. Time the walk cycle with `setDuration(0.24)`, one footfall per 120 ms tile, and don't blend to idle between chained steps. Drive `mixer.update` from simulation time.
- A proposed Vitest check parses the committed GLB in Node.

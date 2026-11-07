# 10: Pip v1 replaces the capsule

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The hero becomes Pip: an agent-built, rigged, animated character, blocked out to the character contract and loaded through the skinned pipeline. See the map's character-pipeline ticket and the hero ticket, including its **amendment** (agents build Pip).

- A bpy script builds Pip v1 from primitives to the contract: faces Blender −Y, origin between the feet, about 1.5 m tall within a 1.2 m footprint, big head, hat crown and brim as the main silhouette. One armature of 12–16 `snake_case` bones with `_L`/`_R`, rigidly weighted. Actions `idle` (breathing) and `walk` (one full cycle, bob and squash), each with a fake user. Material slots named after `HERO_*` palette keys.
- A skinned profile in `export_glb` pins `export_def_bones` and `export_influence_nb = 4`, and fails on more than one armature, a hidden rig, a missing fake user or unexpected clip names. Use the default ACTIONS export with slide-to-zero.
- `loadCharacter()` caches the GLTF and returns a `SkeletonUtils.clone` plus clips. The mixer runs on simulation time; `walk` is set to 0.24 s and chained across steps with no blend to idle; ~0.1 s crossfades otherwise.
- A soft `INK` blob shadow under the feet and a `CREAM` fresnel rim in the hero material. No procedural squash in code.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] A Vitest check parses the Pip GLB: one armature, 12–16 bones, clips exactly `idle` and `walk`, material slot names all `HERO_*`, height about 1.5 m
- [ ] The export fails loudly on each contract violation (tested by a deliberately broken fixture or a script flag)
- [ ] In game, Pip idles when still and walks one footfall per tile across chained steps
- [ ] `pnpm check` and `pnpm test:e2e` pass

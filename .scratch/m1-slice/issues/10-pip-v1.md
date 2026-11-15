# 10: Pip v1 replaces the capsule

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The hero becomes Pip: an agent-built, rigged, animated character, blocked out to the character contract and loaded through the skinned pipeline. See the map's character-pipeline ticket and the hero ticket, including its **amendment** (agents build Pip).

- A bpy script builds Pip v1 from primitives to the contract: faces Blender −Y, origin between the feet, about 1.5 m tall within a 1.2 m footprint, big head, hat crown and brim as the main silhouette. One armature of 12–16 `snake_case` bones with `_L`/`_R`, rigidly weighted. Actions `idle` (breathing) and `walk` (one full cycle, bob and squash), each with a fake user. Material slots named after `HERO_*` palette keys. The builder registers with `pnpm assets:build`.
- A skinned profile in `export_glb`, added as a keyword (`export_glb(path, profile="skinned")`) so static callers don't change. It pins `export_def_bones` and `export_influence_nb = 4`, and fails on more than one armature, a hidden rig, a missing fake user or unexpected clip names. Use the default ACTIONS export with slide-to-zero.
- `loadCharacter()` caches the GLTF and returns a `SkeletonUtils.clone` plus clips. The mixer runs on simulation time, interpolated: render drives it to `simTime + alpha · step` (it freezes with hit-stop and dying). `walk` is set to 0.24 s and chained across steps with no blend to idle; ~0.1 s crossfades otherwise.
- A soft `INK` blob shadow under the feet and a `CREAM` fresnel rim in the hero material. No procedural squash in code. The torch stays a child of the scene, not of Pip.

**Blocked by:** 02, 04

**Status:** resolved

- [x] A Vitest check parses the Pip GLB: one armature, 12–16 bones, clips exactly `idle` and `walk`, material slot names all `HERO_*`, height about 1.5 m
- [x] The export fails loudly on each contract violation (tested by a deliberately broken fixture or a script flag)
- [x] Static exports are byte-identical before and after the profile change
- [x] In game, Pip idles when still and walks one footfall per tile across chained steps; the blob shadow and the rim are present
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-15: Implemented on `ticket/10-pip-v1`.
  - **Builder:** `blender/scripts/build_pip.py` builds Pip v1 from boxes and cylinders and exports `public/models/characters/pip.glb` (LFS) through `export_glb(OUT, profile="skinned")`. `pnpm assets:build` discovers it. The output is deterministic: rebuilding gives the same bytes.
  - **Bones (13, all deform, rigid weights, each pointing +Z from its pivot):** `root` → `hips` → `spine` → `head` → `hat`; `spine` → `arm_L` → `hand_L`, `arm_R` → `hand_R`; `root` → `leg_L` → `foot_L`, `leg_R` → `foot_R`. The legs hang from `root`, not `hips`, so the walk's hip bob doesn't lift the feet.
  - **Material slots (10):** `HERO_HAT`, `HERO_HAT_BAND`, `HERO_COAT`, `HERO_COAT_DARK`, `HERO_SKIN`, `HERO_HAIR`, `HERO_LEATHER`, `HERO_BOOT`, `HERO_GLOVE`, `HERO_SCAR`. The v1 eyes are `HERO_GLOVE`, because no `HERO_*` key is white. That's for ticket 11 to decide.
  - **Clips:** `idle` (48 frames at 24 fps) is spine breathing plus a slight head nod and arm drift. `walk` (16 frames, one full cycle) has footfalls at 0 and 8, root squash at 2/10, stretch at 5/13, a hip bob, opposed leg and arm swings, a spine twist and a hat lag.
  - **Export profile:** `export_glb(path, *, profile="static"|"skinned", clips=("idle","walk"))`. The skinned profile raises `ExportContractError` before writing anything when there isn't exactly one armature, the armature is hidden or has no animation data, an action has no fake user, the action names aren't exactly `clips`, or a material slot isn't a palette key. It then rewrites each slot's Base Color from `palette.json` and exports with ACTIONS mode, slide-to-zero, `export_def_bones=True` and `export_influence_nb=4`. `export_all.py` picks `skinned` for any `.blend` with an armature.
  - **Contract violations:** `pnpm assets:test` (`blender/scripts/test_skinned_export.py`) builds Pip and breaks one rule per case: a second armature, a hidden rig, no animation data, no fake user, an unexpected clip, a missing clip, a renamed clip (`Walk`), an off-palette material. All 8 raise and write no file, and the unbroken build exports (9/9 cases). This runs in Blender, so it's outside `pnpm check`.
  - **Byte-identical static export:** `placeholders/chamber.glb` was sha256 `efd7dc0d…f746d` before the profile change (committed, and rebuilt twice) and is the same `efd7dc0d…f746d` after it, from both `pnpm assets:placeholders` and `pnpm assets:build` (which runs `build_pip` first in the same process). `cmp` reports them identical.
  - **Loading:** `loadCharacter(name)` in `src/assets/models.ts` returns `{ root: SkeletonUtils.clone, clips }` over the cached GLTF, and `instantiateCharacter(gltf)` is the same without the fetch. `loadModel` and `loadGltf` behave as before.
  - **View:** `src/render/hero.ts`, via `createHeroView(character)` and `update(heroFrame(sim, alpha))`. The mixer advances to `sim.timeAt(alpha)` and holds still while `dying`. `walk.setDuration(WALK_CYCLE_S = 2 · STEP_MS)` keeps `walk` playing while `snapshot().moving`, which stays true across chained steps, and the crossfade is `look.hero.fadeMs` (100). The blob shadow is an `INK` `MeshBasicMaterial` with a radial `DataTexture` alpha map, 0.015 m up. The rim is an `onBeforeCompile` patch that adds `CREAM · rimStrength · (1 − n·v)^rimPower` to the emissive, with program key `hero-rim` (strength 0.35, below bloom). New `look.hero` keys: `fadeMs`, `rimStrength`, `rimPower`, `blobRadius`, `blobOpacity`. The torch is still a child of the scene (tested). In dev, `__game.heroView.anim()` exposes the animator.
  - **Tests:** `tests/unit/pip-glb.test.ts` checks the GLB contract (one skeleton, 13 bones, `snake_case` names with matching `_L`/`_R`, 4-wide `skinIndex`, clips exactly `idle`/`walk` starting at t = 0, every slot a `HERO_*` palette key, 1.4–1.6 m tall on the origin, inside 1.2 m, face on +z). `tests/unit/character.test.ts` checks that each clone's skeleton binds its own bones. `tests/unit/hero-view.test.ts` runs the real GLB through idle, three chained steps (half a cycle per tile, idle weight 0 after the fade), the stop crossfade (0.5/0.5 at mid-fade), sim-time driving, and the freeze while dying. `view-materials` checks that rim, blob and roughness follow `look`. e2e `tests/e2e/pip.spec.ts` covers idle, then held east for three chained tiles (walk weight 1, 0.5 cycles per tile), then back to idle, plus the skinned mesh with 13 bones, the blob, and a compiled `hero-rim` program.
  - **Results:** `pnpm check` passes (273 unit tests). `DEV_PORT=5182 pnpm test:e2e` passes 37/37.
  - **Deviations:**
    - The ticket says "12–16 bones", and Pip has 13.
    - The view-materials test that tied the drawn capsule to the contact capsule is gone. ADR 0002 already says the hit volume doesn't depend on any mesh.
    - The blockout's vectors are `[x, y, z]` lists, so the colour-literal scan doesn't read them as RGB triples.
    - Pip's look under the torch (the hat reads warm and bright from the 65° camera) is untuned. That's for ticket 11 and the human.
- 2026-11-15: Merged to `main`. Resolved. Review fixes (`fix/review-09-11`):
  - `export_all.py` picks the profile per asset (`characters/` path or the `export_profile`/`export_clips` scene properties) and exits nonzero after reporting every failure. `assets:export` now fails loudly.
  - The contract check covers exactly the exported materials.
  - Pip's clips unfreeze at respawn rather than at input unlock.
  - The blob shadow filters linearly.

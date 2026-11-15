# 16: Decor (cuttable)

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Purely visual decor (bones, rubble, pots, moss, vines) dresses the chamber the way v2 dresses it. This is the last ticket and can be cut without affecting the slice.

- Port v2's `planDecor` to core **test-first**: sparse, wall-hugging, seeded, never on a hazard, pickup or the critical path, never affecting play.
- Small bpy-procedural props for the four kinds (palette inputs), instanced from the plan. Moss grows on the south face of the wall to the north. The builder registers with `pnpm assets:build`.

**Blocked by:** 09

**Status:** resolved

- [x] Unit tests: same seed, same decor; nothing on a hazard, pickup, the critical path or the spawn zone
- [x] The generator baseline still passes (decor never touches the generator stream)
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-15: Agent build on `ticket/16-decor`. **Kinds:** v2's `planDecor` makes four, not five: `DECOR_KINDS` in hazard-art.js is `bones`, `rubble`, `moss`, `pot`, with no vines, so this follows v2 and the "vines" in the body above is dropped. `src/core/decor.ts` ports `planDecor(level, seed)`: plain floor (map value 0) with a wall north, west or east, a 12 % roll (`DECOR_CHANCE`), moss only under a north wall, avoiding Game.js's set (the critical path, every trap tile and mummy patrol, the keys and coins) plus the spawn zone (`tilesWithin(start, SPAWN_SAFE_RADIUS)`, the one 3D addition). Its rng is v2's `tileRng(seed, col + 500, row + 500)`, a per-tile hash, so it never draws from the generator's `mulberry32` stream; the first two draws are v2's, so tiles and kinds match v2 seed for seed, and two more draws (`shift`, `turn`) give the 3D jitter. Each placement records the wall it hugs (`side`: north first, then west, then east). `tests/unit/decor.test.ts` checks parity against `tests/fixtures/decor-baseline.json` (recorded from v2's own `planDecor` with Game.js's avoid set, on five levels/seeds) less the spawn zone, same seed same plan, nothing on a hazard, patrol, key, coin, chest, the critical path or the spawn zone over v2's 60-seed set, the wall rule, sparseness, and that the level is never mutated. `blender/scripts/build_decor.py` (registered with `pnpm assets:build`) writes `public/models/decor.glb`: `decor_bones` (two crossed long bones and a skull), `decor_rubble` (six chipped blocks), `decor_pot` (a lathed jar with a rolled lip and a shard) and `decor_moss` (a ragged patch on a south-facing wall with a fringe onto the floor), each one flat Principled material from the palette (`BONE`, `STONE_SIDE`, `STONE`, `MOSS`), no textures, no lights. The builder sorts each mesh's verts and faces by position before export: some bmesh ops order their output by pointer, and without it the GLB differed run to run; it now rebuilds byte-identically. `tests/unit/decor-glb.test.ts` checks the contract (node names, sizes, the moss frame, palette colours). The view (`src/render/decor.ts`, `createDecorView(gltf)`) makes one InstancedMesh per kind, sized for a whole map, over the GLB's shared materials, so a level rebuild changes counts and matrices only. Moss sits on the wall foot of the tile's north edge, unturned. Floor props sit `look.decor.inset` from their wall, slid along it by `shift` and turned by up to `turnDeg`. Floor props cast shadows; moss only receives them. `tests/unit/decor-view.test.ts` covers placement and mesh/material reuse. `tests/e2e/decor.spec.ts` checks that levels 0 and 1 instance every planned prop on its tile, with moss on the north wall and no rig-guard violations; chest-transition's program-key check covers the level change with decor in the scene. Shared files touched: `src/main.ts` (load `decor.glb`, add the view, one `levels.add`, `__game.decor`) and `src/render/look/index.ts` (the `decor` section).
- 2026-11-15: Moss isn't visible in play, and vines were dropped (v2 has none). Both are now required: split out as subtask [18](18-moss-and-vines.md).

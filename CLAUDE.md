# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Doom Maze 3D**: a third-person 3D translation of _Pip's Temple Adventure_ from `../pip-maze-v-2` (Phaser 4, 2D). The rules carry over: procedurally generated maze chambers, keys → chest, flames, spikes, axe blades, mummies, coins, a tutorial and a boss arena. The presentation becomes 3D: a three.js runtime with models made in Blender.

**Status: milestone-1 greybox spine.** Levels 0 and 1 play end to end on the procedural sandstone chamber kit (ticket 09) with greybox views (spec `.scratch/m1-slice/spec.md`, tickets 01–08): the seeded generator (v2 parity), grid-snap hero movement, coins, keys and the chest, the HUD, the iris transition and end card, and flames and blades that kill, with death, respawn and grace. Pip v1 (ticket 10: a primitive blockout, skinned, with `idle`/`walk`) replaces the capsule. Real art (Pip's fidelity pass, hazard and pickup models), mummies, the tutorial and the boss arena are not in yet. `docs/v2-port-map.md` lists every v2 module and where it goes; read it, and v2's own `CLAUDE.md`, before porting anything.

## Stack

- **three.js 0.187 (vanilla, no React/R3F)**, Vite 8 (Rolldown), TypeScript 6.0 strict, pnpm.
- TypeScript is pinned to `~6.0`: typescript-eslint 8 supports `<6.1`, so don't bump to TS 7 until it does. TS 6 also deprecates `baseUrl`; path aliases are relative `paths` in `tsconfig.json`, mirrored in `vite.config.ts`.
- **Blender 5.2 LTS** for assets, driven headlessly by Python (bpy) scripts in `blender/scripts/`.
- Vitest (unit, Node env), Playwright (e2e, Chromium with SwiftShader WebGL), ESLint flat config + Prettier.
- three.js moves fast and model recall often lags. Check the installed version's API (`node_modules/three`, or the Context7 MCP) before using anything you're unsure of. Known r187 changes: `PCFSoftShadowMap` was removed (use `PCFShadowMap`), and `Timer` is in core (use it, not `Clock`).

## Commands

- `pnpm dev`: dev server at **http://localhost:5180** (`strictPort`; 8080 belongs to pip-maze-v-2's dev server)
- `pnpm build`: `tsc --noEmit` + production build to `dist/`
- `pnpm check`: typecheck + lint + format:check + unit tests. Run before calling work done.
- `pnpm test` / `pnpm test:watch`: Vitest over `tests/unit/**/*.test.ts`
- `pnpm test:e2e`: Playwright over `tests/e2e/`. Starts `pnpm dev` itself; the smoke test waits for `body[data-ready="true"]`.
- `pnpm format`: Prettier write
- `pnpm assets:build`: runs every procedural bpy builder (`blender/scripts/build_*.py`, discovered by name) so a palette change rebuilds every GLB. A new builder registers by being named `build_<name>.py` and doing its work under `if __name__ == "__main__":` from a fresh scene.
- `pnpm assets:placeholders`: bpy builds the greybox placeholder chamber kit → `public/models/placeholders/chamber.glb` (a debugging fallback; the game loads the sandstone kit, `public/models/kit/chamber.glb`, from `build_chamber_kit.py`, which bakes its atlas in Cycles in about 45 s)
- `pnpm assets:test`: in Blender, breaks the character contract once per rule and checks the skinned export refuses each (`blender/scripts/test_skinned_export.py`), checks the Pip turnaround renders (`test_render_pip.py`), and checks `export_all`'s per-asset profiles and failure reporting (`test_export_all.py`). Run it after touching `lib/gltf.py`, `export_all.py` or `build_pip.py`.
- `pnpm assets:export`: exports every `blender/source/**/*.blend` → `public/models/**/*.glb` (same relative path)

`blender/blender.sh` finds Blender through `$BLENDER`, then `blender` on PATH, then `/Applications/Blender.app`.

## Architecture

Layers, in dependency order (an import may only point left):

`src/core` → `src/game` → `src/render` / `src/ui` / `src/assets` → `src/main.ts`

- **`src/core/`**: pure, deterministic game logic: grid, generator, pathfinding, mummy AI, hazard timing. **No three.js, no DOM.** ESLint enforces this (`no-restricted-imports`, `no-restricted-globals`) so everything here is unit-testable in Node. `grid.ts` is the only grid ↔ world mapping. Origin at the map's top-left corner, col → +x, row → +z, positions at tile centres, `TILE_SIZE` = 2 m. Exports `tileToWorld`, `worldToTile` (floor; edges go to the higher tile; not clamped), `tileKey` (v2's `"col,row"` format), `mazeBounds`, `GridPos`, `WorldXZ`.
- **`src/game/`**: simulation and orchestration: `loop.ts` (fixed timestep), and later scenes/state, input, player-db.
- **`src/render/`**: everything three.js: renderer (`renderer.ts`), chamber building, hero rig, hazards, FX, palette (`palette.json` + `palette.ts`), feel tunables (`look/`), light rig (`lights.ts`), rig guard (`rig-guard.ts`).
- **`src/ui/`**: DOM overlay (HUD, menus, touch d-pad) inside `#hud` in `index.html`. HTML/CSS, not three.js, so camera post-processing never touches it (the same reason v2 keeps HUD in its own scene).
- **`src/assets/`**: loaders. `loadModel(name)` loads `public/models/<name>.glb`, caches the parse, and returns a clone (shadow flags as exported; each view sets its own). `loadCharacter(name)` is the skinned version: a `SkeletonUtils.clone` plus the shared clips (one `AnimationMixer` per instance). `loadGltf(name).getNode(node)` returns a named node's shared geometry and material for instancing (the chamber kit).

Path aliases: `@core/*`, `@game/*`, `@render/*`, `@ui/*`, `@assets/*`.

### Loop & determinism

- `createFixedLoop` runs `update(dt)` in constant 1/60 s ticks and calls `render(alpha)` once per frame. Frames are clamped to 0.25 s. All gameplay timing (grid steps, `HAZARD_TIMING`, mummy AI) goes in `update`; `render` only interpolates and draws.
- As in v2, **never use `Math.random` for anything level-visible**. Use the seeded `mulberry32` RNGs from the generator (once ported). Level seeds must stay replayable.
- Movement stays **grid-snap** (v2: 120 ms per tile), not physics. 3D is a view over the 2D grid simulation: logic lives in (col, row), and only `tileToWorld` converts to world space.

### Camera

Fixed-yaw north chase (`src/render/camera-rig.ts`, map ticket 01): the camera never rotates, so arrows/WASD map 1:1 to world grid directions. No camera-relative input.

## Blender conventions

- `blender/source/**/*.blend`: hand-authored sources. `blender/scripts/*.py`: procedural builders and exporters. `blender/scripts/lib/`: shared helpers (`paths.py`, `gltf.py`). Scripts put their own dir on `sys.path`, so import as `from lib.gltf import export_glb`.
- **All glTF export goes through `lib/gltf.export_glb`**, so hand-made and generated assets get identical settings: GLB, `export_yup` (Blender Z-up → three Y-up), modifiers applied, custom properties → `userData`.
- **1 Blender unit = 1 metre = 1 three.js unit.** Maze pieces are modelled centred on the origin in X/Y, with the base on Z=0, and sized to `TILE_SIZE`. `TILE_SIZE` and `WALL_HEIGHT` (2.2 m) are duplicated in `blender/scripts/lib/kit.py` (shared by both kit builders); keep them in sync with `src/core/grid.ts` and `src/render/chamber-kit.ts`. The chamber kit's node names and local frames are the contract in `chamber-kit.ts`, including the face's cap lip (`LIP_REACH`, `LIP_BOTTOM`, mirrored in `build_chamber_kit.py`).
- Objects whose names start with `_` (helpers, boolean cutters) are not exported.
- **Characters** (`build_pip.py` → `public/models/characters/pip.glb`) export with `export_glb(path, profile="skinned")`, which raises `ExportContractError` unless: exactly one visible armature with animation data; every action has a fake user; the actions are exactly the expected clips (`idle`, `walk`, lowercase); every exported mesh has a material slot and every exported slot is named after a palette key (its Base Color is rewritten from `palette.json`). Bones are `snake_case` with `_L`/`_R`, never dots (three strips them). `export_all.py` takes each `.blend`'s profile from the asset, never from an armature: `skinned` under `blender/source/characters/`, else `static`; a scene custom property `export_profile` overrides it, and `export_clips` (comma-separated) sets the exact clips (default `idle,walk`). It attempts every file, lists every failure, and exits nonzero if any failed. The static profile's settings are unchanged.
- Exported `.glb` files in `public/models/` are build outputs, but they are committed (via LFS) so the game runs without Blender. Re-export after changing a source.

## Git LFS

`.blend`, `.glb`, `.fbx`, `.hdr`, `.exr`, `.ktx2`, `.png`, `.jpg`, `.wav`, `.ogg`, `.woff2`, `.ttf` are LFS-tracked (`.gitattributes`). Add new binary types to `.gitattributes` **before** committing the first file of that type.

## Porting from v2

- Port pure modules into `src/core` test-first. For the generator, port v2's baseline fixture test (`tests/generator-coins.test.mjs`, `tests/fixtures/generator-baseline.json`) to Vitest before the code, so seed-for-seed parity is proven.
- v2 rules that still apply: telegraphs stay inside the original hazard timings; hazard go-live hooks re-check tile occupants; respawn grace of 1 s; coins bank on pickup; dual-key levels from index ≥ 3; map tile values `0` floor / `1` wall / `2` start / `3` chest.
- All colours come from v2's "Torchlit Sandstone" `P`/`LIGHT`, kept in one file: `src/render/palette.json` (plus the reserved `HERO_*` block and `LIGHT.KEY`). `palette.ts` gives `P`, `LIGHT`, `color()` (linear `THREE.Color`) and `css()`; `blender/scripts/lib/palette.py` gives linear `rgb()`/`rgba()`. CSS reads palette custom properties (`--ink`, `--gold-light`, …) that `main.ts` sets at boot. Don't write hex or RGB colour literals anywhere else, in TS, CSS, HTML or Python: `tests/unit/no-colour-literals.test.ts` fails on them. Light comes from the top-left of the screen, which is the north-west in 3D.

## Art direction

Stylised PBR, not pixel art: see `docs/adr/0001-stylised-pbr-art-direction.md`, with full detail in `.scratch/3d-slice/issues/02-art-direction.md`.

- The palette is an **authoring** palette. Every material input, emissive and light colour comes from it; lit output may leave it. Ramps give surface variation (block tone, mortar, wear), not painted lighting.
- The colour reservations are binding: fire ramp only for hazards and telegraphs (the one exception is a flame carried by the hero: `FIRE_HOT`/`FIRE_CORE` only), gold only for pickups, curse teal only for mummies, steel only for blades and spikes. The floor is the darkest, lowest-contrast surface.
- Kit materials are bpy-procedural Principled BSDF setups with palette inputs, baked to texture sets with AO, at 128 px/m. CC0 maps are for greyscale detail only, never colour.
- Lights are fixed at 1 shadowed north-west key + 1 hemisphere fill + 1 torch + 4 flame-pool slots, plus a palette gradient environment map. Pickups glow through emissive + bloom, never with their own light. Never add, remove or toggle a light during play (that recompiles shaders). Every light is a direct child of the scene. In dev, `rig-guard` checks every frame that the live light count and `renderer.info.programs.length` stay at their post-boot baseline.
- Tone mapping is `NeutralToneMapping`, DPR capped at 1 (`look.renderer.maxPixelRatio`; at 2 the post chain is fill-bound), and the composer renders into a 4-sample `HalfFloatType` target (the canvas has no AA). Post: bloom (only emissive at intensity ≥ 2) → vignette → `OutputPass`. No SSAO, outline or pixelation passes.
- Feel values (light intensities, bloom, vignette, material numbers) live in `src/render/look/` (`import { look } from '@render/look'`), with a dev-only lil-gui panel and frame-time readout. Each domain is one file, `look/<domain>.ts`, that calls `section(name, values, ranges)` from `look/registry.ts` (which registers it with the panel); add the domain with one line in `look/index.ts`. Render code reads look values every frame, so panel edits are live. Don't hard-code feel values elsewhere.

## Dev tooling

- In dev builds, `window.__game` exposes `{ scene, camera, renderer, composer, bloom, look, rig, guard, stats }`.
- Light bench: dev panel → `bench` → `poolsAtPeak` drives all pool slots at peak; `frame time` → `log summary` logs `{ frames, meanMs, p95Ms, worstMs, over33 }`.
- Fonts: Black Ops One (display) and Pixelify Sans (body) are self-hosted in `public/fonts/` with their OFL licences; CSS vars `--font-display` / `--font-body`.
- `.claude/skills/threejs-builder/` (copied from v2) covers three.js patterns: glTF loading/cloning, coordinate frames, game patterns.
- `.claude/launch.json` defines the `dev` preview server (port 5180).

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

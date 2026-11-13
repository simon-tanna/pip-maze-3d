# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Doom Maze 3D**: a third-person 3D translation of _Pip's Temple Adventure_ from `../pip-maze-v-2` (Phaser 4, 2D). The rules carry over: procedurally generated maze chambers, keys → chest, flames, spikes, axe blades, mummies, coins, a tutorial and a boss arena. The presentation becomes 3D: a three.js runtime with models made in Blender.

**Status: scaffold only.** `src/main.ts` boots a placeholder scene (capsule hero over a chamber-sized greybox of Blender-exported placeholders) with the real light rig and post chain. No game logic has been ported. `docs/v2-port-map.md` lists every v2 module and where it goes; read it, and v2's own `CLAUDE.md`, before porting anything.

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
- `pnpm assets:placeholders`: bpy builds placeholder wall/floor → `public/models/placeholders/*.glb`
- `pnpm assets:export`: exports every `blender/source/**/*.blend` → `public/models/**/*.glb` (same relative path)

`blender/blender.sh` finds Blender through `$BLENDER`, then `blender` on PATH, then `/Applications/Blender.app`.

## Architecture

Layers, in dependency order (an import may only point left):

`src/core` → `src/game` → `src/render` / `src/ui` / `src/assets` → `src/main.ts`

- **`src/core/`**: pure, deterministic game logic: grid, generator, pathfinding, mummy AI, hazard timing. **No three.js, no DOM.** ESLint enforces this (`no-restricted-imports`, `no-restricted-globals`) so everything here is unit-testable in Node. `grid.ts` is the only grid ↔ world mapping. Origin at the map's top-left corner, col → +x, row → +z, positions at tile centres, `TILE_SIZE` = 2 m. Exports `tileToWorld`, `worldToTile` (floor; edges go to the higher tile; not clamped), `tileKey` (v2's `"col,row"` format), `mazeBounds`, `GridPos`, `WorldXZ`.
- **`src/game/`**: simulation and orchestration: `loop.ts` (fixed timestep), and later scenes/state, input, player-db.
- **`src/render/`**: everything three.js: renderer (`renderer.ts`), chamber building, hero rig, hazards, FX, palette (`palette.json` + `palette.ts`), feel tunables (`look/`), light rig (`lights.ts`), rig guard (`rig-guard.ts`).
- **`src/ui/`**: DOM overlay (HUD, menus, touch d-pad) inside `#hud` in `index.html`. HTML/CSS, not three.js, so camera post-processing never touches it (the same reason v2 keeps HUD in its own scene).
- **`src/assets/`**: loaders. `loadModel('placeholders/wall')` loads `public/models/placeholders/wall.glb`, caches the parse, and returns a clone. Use `SkeletonUtils.clone` for skinned models.

Path aliases: `@core/*`, `@game/*`, `@render/*`, `@ui/*`, `@assets/*`.

### Loop & determinism

- `createFixedLoop` runs `update(dt)` in constant 1/60 s ticks and calls `render(alpha)` once per frame. Frames are clamped to 0.25 s. All gameplay timing (grid steps, `HAZARD_TIMING`, mummy AI) goes in `update`; `render` only interpolates and draws.
- As in v2, **never use `Math.random` for anything level-visible**. Use the seeded `mulberry32` RNGs from the generator (once ported). Level seeds must stay replayable.
- Movement stays **grid-snap** (v2: 120 ms per tile), not physics. 3D is a view over the 2D grid simulation: logic lives in (col, row), and only `tileToWorld` converts to world space.

### Camera

Third-person follow (behind/above the hero). Input directions will need to be camera-relative while the simulation stays on the grid.

## Blender conventions

- `blender/source/**/*.blend`: hand-authored sources. `blender/scripts/*.py`: procedural builders and exporters. `blender/scripts/lib/`: shared helpers (`paths.py`, `gltf.py`). Scripts put their own dir on `sys.path`, so import as `from lib.gltf import export_glb`.
- **All glTF export goes through `lib/gltf.export_glb`**, so hand-made and generated assets get identical settings: GLB, `export_yup` (Blender Z-up → three Y-up), modifiers applied, custom properties → `userData`.
- **1 Blender unit = 1 metre = 1 three.js unit.** Maze pieces are modelled centred on the origin in X/Y, with the base on Z=0, and sized to `TILE_SIZE`. `TILE_SIZE` is duplicated in `blender/scripts/build_placeholders.py`; keep it in sync with `src/core/grid.ts`.
- Objects whose names start with `_` (helpers, boolean cutters) are not exported.
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
- Tone mapping is `NeutralToneMapping`, DPR capped at 2, and the composer renders into a 4-sample `HalfFloatType` target (the canvas has no AA). Post: bloom (only emissive at intensity ≥ 2) → vignette → `OutputPass`. No SSAO, outline or pixelation passes.
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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Doom Maze 3D**: a third-person 3D translation of _Pip's Temple Adventure_ from `../pip-maze-v-2` (Phaser 4, 2D). The rules carry over: procedurally generated maze chambers, keys → chest, flames, spikes, axe blades, mummies, coins, a tutorial and a boss arena. The presentation becomes 3D: a three.js runtime with models made in Blender.

**Status: scaffold only.** `src/main.ts` boots a placeholder scene (capsule hero + Blender-exported wall) to prove the toolchain. No game logic has been ported. `docs/v2-port-map.md` lists every v2 module and where it goes; read it, and v2's own `CLAUDE.md`, before porting anything.

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
- `pnpm assets:placeholders`: bpy builds placeholder wall/floor → `public/models/placeholders/*.glb`
- `pnpm assets:export`: exports every `blender/source/**/*.blend` → `public/models/**/*.glb` (same relative path)

`blender/blender.sh` finds Blender through `$BLENDER`, then `blender` on PATH, then `/Applications/Blender.app`.

## Architecture

Layers, in dependency order (an import may only point left):

`src/core` → `src/game` → `src/render` / `src/ui` / `src/assets` → `src/main.ts`

- **`src/core/`**: pure, deterministic game logic: grid, generator, pathfinding, mummy AI, hazard timing. **No three.js, no DOM.** ESLint enforces this (`no-restricted-imports`, `no-restricted-globals`) so everything here is unit-testable in Node. `grid.ts` holds `TILE_SIZE` (2 m) and `tileToWorld`, the only grid → world mapping.
- **`src/game/`**: simulation and orchestration: `loop.ts` (fixed timestep), and later scenes/state, input, player-db.
- **`src/render/`**: everything three.js: renderer (`renderer.ts`), chamber building, hero rig, hazards, FX, palette.
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

`.blend`, `.glb`, `.fbx`, `.hdr`, `.exr`, `.ktx2`, `.png`, `.jpg`, `.wav`, `.ogg` are LFS-tracked (`.gitattributes`). Add new binary types to `.gitattributes` **before** committing the first file of that type.

## Porting from v2

- Port pure modules into `src/core` test-first. For the generator, port v2's baseline fixture test (`tests/generator-coins.test.mjs`, `tests/fixtures/generator-baseline.json`) to Vitest before the code, so seed-for-seed parity is proven.
- v2 rules that still apply: telegraphs stay inside the original hazard timings; hazard go-live hooks re-check tile occupants; respawn grace of 1 s; coins bank on pickup; dual-key levels from index ≥ 3; map tile values `0` floor / `1` wall / `2` start / `3` chest.
- All colours come from one palette module (v2's "Torchlit Sandstone" `P`/`LIGHT`). Don't write hex colours elsewhere once `src/render/palette.ts` exists. Light comes from the top-left.

## Dev tooling

- In dev builds, `window.__game` exposes `{ scene, camera, renderer }`.
- `.claude/skills/threejs-builder/` (copied from v2) covers three.js patterns: glTF loading/cloning, coordinate frames, game patterns.
- `.claude/launch.json` defines the `dev` preview server (port 5180).

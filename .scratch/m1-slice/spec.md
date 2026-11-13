# Spec: Milestone 1, the vertical slice

Status: ready to split
Map: [Doom Maze 3D, the way to a first playable slice](../3d-slice/map.md)
Validation: GO with conditions (2026-11-07); this revision applies the conditions.

## Goal

Levels 0 and 1, generated exactly as v2 generates them (flames and blades, 2–5 coins, a single key, no mummies, no spikes), walked in third person on a desktop keyboard. Reaching the chest with the key irises into the next level. After level 1, an end card restarts the run.

Rules are v2's except where a decision below (or an ADR) says otherwise. Every "v2" value cited here comes from `../pip-maze-v-2` and is a **starting value**. Feel values live in `src/render/look.ts`.

## Prerequisites (outside this spec)

None outside this spec. The `generator` port is ticket 01. The flame half of `hazard-timing` lands with ticket 07, and the blade half with ticket 08. The slice doesn't need `grid-path`: v2 uses it only for mummies.

## Decisions this spec builds on

Read the ticket for detail. This spec doesn't restate them.

- Camera and input: [01](../3d-slice/issues/01-camera-and-input.md). Fixed-yaw north chase (7 m back, 15.7 m up, fov 57, lag 0.12 s, lead 1 m). Arrows and WASD map 1:1 to the grid. A blocked key does nothing.
- Art direction: [02](../3d-slice/issues/02-art-direction.md), ADR 0001. Lighting budget: [03](../3d-slice/issues/03-lighting-budget.md).
- Character pipeline: [04](../3d-slice/issues/04-character-pipeline.md). Hero: [06](../3d-slice/issues/06-slice-hero.md), with its amendment (agents build Pip).
- Chamber build: [05](../3d-slice/issues/05-chamber-build.md).
- Hazards: [07](../3d-slice/issues/07-hazards-in-3d.md). Blade rule: [09](../3d-slice/issues/09-blade-contact-rule.md), ADR 0002.

## Design

### Scope and run

- **Levels.** Index 0 and 1 (`LEVEL_CONFIGS[0..1]`: flame and blade, 0 mummies, single key). The HUD shows "CHAMBER N", where N = index + 1.
- **Seeds.**
  - `levelSeed(base, i)`: `i === 0` gives `base`; otherwise the i-th uint32 drawn from `mulberry32(base ^ 0x9e3779b9)`. Pure, in `src/core`, unit-tested.
  - `?seed=S&level=i` pins a run. Level i is generated with S **as its own seed**, so any v2 (index, seed) pair reproduces as-is. S is also the run's base seed: a later level j uses `levelSeed(S, j)`.
  - Without params, one base seed is drawn at boot with `crypto.getRandomValues` and logged to the console. It is level 0's seed.
  - URL input: `level` must be 0 or 1 and `seed` a decimal uint32 (0 … 2³² − 1). Anything else logs a warning and falls back to the unpinned behaviour.
  - A level keeps its seed for the whole run. `Math.random` is never used for anything level-visible.
- **Session state.** Coins bank on pickup into an in-memory session total, which survives death and restart and is lost on reload. Keys are per level. There is no `player-db` and no player name.
- **End of slice.** Opening level 1's chest irises into the `ended` state: a DOM card on `INK` with "END OF SLICE", the coin total, and "PRESS ANY KEY". A fresh key press restarts: at the pinned `level` with the same seed if `?seed=` is pinned, otherwise at level 0 with a fresh base seed.
- **Dual keys (in, not exercised).** `requiredKeys`, the key-2 reveal when key 1 is collected, the 2-slot HUD, and v2's rule that losing key 1 hides an uncollected key 2 again. All are unit-tested on a synthetic level; levels 0 and 1 have one key, so e2e never exercises them.
- **Out:** audio, touch, Title / Player / Win scenes, Tutorial, Boss / Arena, character select, levels 2–8, mummies, spikes, `player-db` and player name. Decor (ticket 16) is cuttable.

### Simulation (`src/core`, `src/game`)

- **Time.** Every rule runs on simulation milliseconds, accumulated in the fixed 1/60 s ticks.
  - Timers (death, grace, hit-stop) fire on the first tick at or after their threshold.
  - A chained step carries its overshoot into the next step (`progress = (elapsed − 120·n) / 120`), so held walking averages exactly 120 ms per tile.
  - The level's hazard clock starts at 0 when `entering` begins (v2 starts hazards as its iris opens) and runs through `playing` and death. It stops in `leaving`.
- **Steps.** Grid-snap, 120 ms per tile. The hero takes the destination tile at step start, as in v2.
- **`stepPosition(from, to, progress)`.** A pure function in `src/core` that moves linearly at constant speed from one tile centre to the next. It is the only source of a body's mid-step position. Blade contact calls it every tick, and the hero view calls it in `render(alpha)`. "What you see is what kills."
- **Input.** Port `grid-input`: world-relative directions, hold-to-walk, a 180 ms buffer, newest-held-wins, corner assist. Remove the port map's stale "camera-relative" line.
  - Buffer age is measured in simulation time, not `performance.now()`, so `pause()` / `advance()` stay deterministic.
  - Keep v2's clear-on-blur and its `!event.repeat` filter.
  - Input is cleared (held and buffered) when the chest opens and on restart. It unlocks when `entering` completes.
- **Hazards.**
  - Flame: whole-tile lethal while `on`, checked on landing and on go-live (occupant re-check). A flame's phase is a start delay, as in v2: `state(t) = t < phase ? off : cycle((t − phase) mod 4500)`. Grace ending triggers no re-check (v2 parity): a hero standing in a live flame when grace ends survives until the next go-live or landing.
  - Blade: contact, checked every tick at mid-step positions against the body capsule (r 0.4, h 1.5), per ADR 0002.
  - All timing comes from `HAZARD_TIMING`, including the new `bladeSpin = 1600`. v2's `bladeHalfSwing` and `bladeDangerAngle` are not ported.
  - Phases: seeded per tile with `tileRng`. Blades in a shared-wall chain (same column, two rows apart, repeated) all take the phase of the chain's northernmost blade.
- **Death.** Every kill runs the same sequence, driven by timers in `update`:
  1. t = 0: cut the step, set the logical tile to the start tile, set `dying`, facing south. Drop the most recent key; it respawns on its tile with the fade-in pop. Losing key 1 also hides an uncollected key 2.
  2. t = 270 ms (`gone`): respawn at the start tile and begin **grace** (1 s, hazards ignore the hero).
  3. t = 530 ms: input unlocks. Held or buffered keys then fire.
- **Hit-stop.** A simulation concern, not a render one. On key pickup the loop skips 4 `update` ticks (60 ms; 1 tick under reduced motion). The hazard clock, the step, the death timers and the mixer all pause together, so the frozen frame is still what kills. None on death.
- **Pickups.** Checked on step landing in v2's order: coin → key → chest.
  - The chest opens only with all required keys.
  - Landing on the chest without them shows the toast "Find the key first!", every time.
  - The chest opening clears and locks input and starts the `leaving` transition.
- **Events.** The simulation emits typed events (`step`, `landed`, `died`, `respawned`, `coin`, `key`, `keyLost`, `chestLocked`, `chestOpened`, `hazardLive`). Payloads carry the tile (and world position where a view needs it). Views and the HUD react to events and never read the scene.

### State machine (`src/game/state.ts`)

`loading → building → entering → playing → leaving → building → …`, all on `createFixedLoop`. After the last slice level, `leaving → ended`, and a fresh key press goes `ended → building(level)`. Any load failure goes to `failed`.

- **loading**: `#hud` shows "Loading…" on `INK`. Load the GLBs.
- **building**: behind full `INK`. Run `planChamber` → set instance counts, rebuild per-level hazard and pickup views, fit the shadow frustum to the map, reset camera lag. Level 0 takes this path too. After the first build, `renderer.compileAsync` runs once with the full, fixed light rig and every view and pooled FX object in the scene.
- **entering**: iris open on the hero. The hazard clock starts. Input unlocks when it completes.
- **playing**: dying and grace are simulation sub-state here, not machine states.
- **leaving**: chest open, wait 350 ms, iris close.
- **ended**: the end card. Keys reset, the coin total is kept, input is cleared. The restart listener is persistent but acts only while `state === ended`, ignores repeats, and consumes its key (it never reaches grid input).
- **failed**: a GLB or `compileAsync` rejection shows the error in `#hud` and sets `body[data-ready="error"]`, so e2e fails fast.
- Set `body[data-ready="true"]` when the first chamber reaches `playing`.
- **Teardown never adds, removes or toggles a light.** The 4 pool slots and the torch persist and drop to intensity 0. InstancedMeshes are reused. Materials are module-scoped and shared across levels; teardown disposes only per-level geometry and Object3Ds, so no program is freed and recompiled.
- **Layering.** `state.ts` stays in `src/game` and imports nothing from `render` or `ui`. It depends on interfaces it declares (`ChamberView { build(level); precompile() }`, `Transition { close(at); open(at) }`, `CameraRig { resetLag() }`), and `src/main.ts` wires the implementations. ESLint enforces it: `src/game/**` may not import `@render/*`, `@ui/*` or `three`, and `@render` and `@ui` may not import each other.

### Render (`src/render`)

- **Foundation.**
  - `palette.json` gets a `HERO_*` block. `palette.ts` exposes `P`, `LIGHT`, `color()` and `css()`; `blender/scripts/lib/palette.py` reads the same JSON.
  - `look.ts` holds every feel value, in per-domain sections (camera, hud, flame, blade, pickups, fx, hero), with a dev-only lil-gui panel and a frame-time readout.
  - Renderer: `NeutralToneMapping`, DPR capped at 2. EffectComposer on a 4-sample `HalfFloatType` render target sized by DPR (the canvas drops `antialias: true`) → bloom (threshold 1.0, strength 0.45) → vignette → `OutputPass`.
  - Lights, fixed: a north-west shadowed key light (55–60°), a hemisphere fill, the torch, 4 pool slots, and a palette-gradient PMREM env map. Every light is a direct child of the scene, never of a node that can be hidden. The torch copies the hero's position each render.
- **Chamber.** As in 05: `planChamber` (core) → one `InstancedMesh` per (piece, variant) from `kit/chamber.glb`. `planChamber` takes the level (map and hazards), so it can pick the `face_slot` variant for wall tiles north and south of a blade. Each mesh is allocated at the worst case `PLAN_CAPACITY` exports for its piece, and `computeBoundingSphere()` runs after every build. Padding ring, contact strips, shadow frustum fixed to the map at 2048².
- **Hero.**
  - Pip from `characters/pip.glb` via `loadCharacter()`. The mixer runs on simulation time, interpolated: render drives it to `simTime + alpha · step`. `walk` is set to 0.24 s and chained across steps with no blend to idle.
  - Turns take the shortest arc over 60 ms, render-only.
  - Soft `INK` blob shadow and a `CREAM` fresnel rim.
  - The rig plays the hit flash (80 ms `CREAM` emissive), knockback (0.25 m, 110 ms), collapse (160 ms) and respawn pop (260 ms, Back ease).
  - Grace flicker toggles the hero mesh's visibility (never an ancestor of a light) every 80 ms; under reduced motion it becomes a steady boosted rim.
- **Camera.** Follows the interpolated hero position with 0.12 s lag. On death it **holds** on the death spot; at `gone` it **cuts** to the start tile with lag reset.
- **Flame** (07, preset D):
  - Bpy `hazards/flame.glb` (grate and nozzle).
  - A 3.6 m additive shader column, about 36 embers/s through the telegraph, and a 3.4 m additive glow decal.
  - Pool-light allocator: firing flames first, then telegraphing, then nearest to the hero; ~100 ms intensity fades, peak scale 2. The slot count is confirmed by ticket 02's light bench.
- **Blade.** Bpy `hazards/blade.glb` from `lib/blade.py` + `blade-shape.json`: head, haft and axle, plus two `STONE_DARK` lintels. Spins across the corridor (north–south). No trail, edge glow or decal.
- **Pickups.** Bpy `pickups.glb` with nodes `key`, `coin`, `chest` and `chest_lid`. `GOLD` / `GOLD_LIGHT` metal with subtle emissive, bloom, and an additive floor glow decal under each. No real lights.
  - Key (~0.6 m): floats ~0.5 m up, bobs 0.12 m over 900 ms (sine yoyo), turns once every 3 s.
  - Coin (~0.4 m): the same bob, plus a turn with a seeded phase.
  - Chest (~1.2 m): emissive pulse over 900 ms (yoyo).
  - Chest open: squash (1.2, 0.8) 80 ms → (0.9, 1.2) 140 ms → (1, 1) 120 ms; the lid swings to ~110° over 220 ms; sparkle ×28; emissive burst; shake 160 ms.
  - Key fade-in (reveal and respawn): from scale 0.4, 500 ms Back ease, sparkle ×10.
- **FX** (`fx.ts`). Pooled, instanced, camera-facing quads, simulated in `render` with a render-local seeded RNG.
  - Dust (`SAND` / `STONE_LIGHT`): ×3 on step landing, ×6 on respawn.
  - Puff: ×10 on death.
  - Sparkle (`GOLD_LIGHT`): key ×16, coin ×8, chest ×28.
  - Counts and lifetimes start at v2's `createWorldFx`.
  - Screen shake is positional camera jitter: 120 ms on death, 160 ms on chest open.
  - Hit-stop is in _Simulation_; the view simply freezes with sim time.

### HUD and overlays (`src/ui`, DOM in `#hud`)

- **Panels.** v2's `drawPanel` in CSS: `SHADOW` fill at 0.92, a 2 px `INK` border, a 2 px accent on the top and left edges, an `INK` bottom line at 0.6. Fonts are Black Ops One (display) and Pixelify Sans (body), both OFL, self-hosted under `public/fonts/` (no third-party requests). All colours come from `css()`.
- **Projection.** `src/ui` never imports three.js. `main.ts` injects `project(world) → { x, y } | null`, which the fly-to and the iris use.
- **Layout.**
  - Top-left: the "CHAMBER N" title panel.
  - Next to it: the coin panel (`GOLD_DARK` accent) with a coin icon and the session total.
  - Top-right: key slots (1 or 2), empty as `INK`-tinted at 0.75, filled at full colour.
- **Toast.** Centred, `GOLD_LIGHT`. Fades in over 180 ms, holds 900 ms, fades out over 300 ms.
- **Fly-to.** On pickup, project the pickup's world position to the screen once. A DOM sprite flies to the target element's rect over 450 ms (cubic in-out). On landing, the slot or coin pops (scale 1.3 → 1 over 200 ms, Back ease) and a "+1" floats away over 800 ms. The coin total banks at pickup and is displayed when the sprite lands. A key slot always renders from the simulation's current key count, never the count at pickup, and in-flight key sprites are cancelled on `keyLost`.
- **Damage flash.** A DOM `BLOOD` overlay at 0.22 alpha for 300 ms.
- **Iris.** A DOM `INK` overlay with a radial-gradient mask. It closes on the chest's projected position (420 ms, cubic-in) and opens on the hero (420 ms, cubic-out).
- **Reduced motion** (`prefers-reduced-motion`): no shake, no damage flash, hit-stop capped at 1 tick, the iris is an instant cut, no HUD pops (flights stay), no coin bob or turn, and the steady rim instead of the flicker. Each rule's ticket tests it with the media feature emulated, against an observable (shake offset, bob amplitude, pop scale) exposed through `sim` or `look`.

### Dev tooling

- Dev builds only: `window.__game` adds `sim`:
  - read-only state: hero tile, facing, keys, coins, level index, level time, machine state, `dying`, grace
  - `press(dir)` / `release(dir)`, which go through the real input path
  - `pause()` stops the rAF-driven advance; `advance(ms)` runs `ceil(ms / step)` update ticks directly (bypassing the 0.25 s frame clamp) followed by one render
  - `hazardsOff(bool)`, so e2e routes written before hazards were lethal stay valid
- A ground-truth overlay of lethal tiles (ticket 07) and the blade contact zone (ticket 08), the prototype's `G`.
- All of it is stripped from production, like lil-gui.

### Acceptance

- `pnpm check` and `pnpm test:e2e` pass.
- Scripted e2e on a pinned seed (ticket 08 owns it, on the shared fixture from ticket 04): walk the route to key and chest, die on a known flame and respawn at the start with the key restored, see level 1 build, reach the end card and restart.
- The human plays levels 0 and 1 on the MacBook (chip recorded on ticket 17) at 1080p, DPR 1, bloom on, and signs off the `look.ts` tuning.

### Non-functional requirements

- **Frame time.** p95 ≤ 16.7 ms over a full run of levels 0–1, transitions included, read from the frame-time readout's logged summary. This is a **soft gate**: a miss doesn't block sign-off, but its cause is recorded on ticket 17 with a follow-up ticket. Performance is human-gated only; SwiftShader e2e can't measure it.
- **Load.** `loading` to first `playing` in under 3 s on the MacBook with a warm cache.
- **Memory.** `renderer.info.memory` geometries and textures return to their level-0 baseline after a level 0 → 1 → restart cycle.
- **Browsers.** Chromium and Safari on macOS. E2e runs on Chromium only.

## Issues

Tickets live in [`issues/`](issues/). There are two phases: a **greybox spine** (01–08), in which every ticket leaves the build green and adds one verifiable capability (the game is playable from 04), and **art and feel passes** (09–17), which swap the real look in behind a game that already works.

**Unblocking rule.** A ticket with a human sign-off checkbox is _agent-complete_ when every other box is ticked; that unblocks its dependents. The human's sign-off is recorded later as a dated line under the ticket's `## Comments` and gates only ticket 17. Batch the sign-offs for 09, 12, 13 and 14 into one review session.

| #   | Ticket                                                                               | Blocked by | Size |
| --- | ------------------------------------------------------------------------------------ | ---------- | ---- |
| 01  | [Port the level generator, seed for seed](issues/01-port-generator.md)               | –          | M    |
| 02  | [Light the scene with the fixed rig and post chain](issues/02-light-rig-and-post.md) | –          | M    |
| 03  | [See level 0's chamber](issues/03-see-the-chamber.md)                                | 01, 02     | M    |
| 04  | [Walk the hero through the chamber](issues/04-hero-walks.md)                         | 03         | L    |
| 05  | [Collect coins and the key, shown on the HUD](issues/05-pickups-and-hud.md)          | 04         | M    |
| 06  | [Open the chest and move on to the next level](issues/06-chest-and-transition.md)    | 05         | L    |
| 07  | [Die on flames and respawn](issues/07-flames-kill.md)                                | 04, 05, 06 | M    |
| 08  | [Die on spinning blades by contact](issues/08-blades-kill.md)                        | 07         | L    |
| 09  | [Procedural sandstone kit](issues/09-sandstone-kit.md)                               | 03         | L    |
| 10  | [Pip v1 replaces the capsule](issues/10-pip-v1.md)                                   | 02, 04     | L    |
| 11  | [Pip fidelity pass](issues/11-pip-fidelity.md)                                       | 10         | M    |
| 12  | [Flames read as light](issues/12-flame-look.md)                                      | 02, 07     | M    |
| 13  | [Steel blade and lintels](issues/13-blade-look.md)                                   | 08, 09     | M    |
| 14  | [Gold pickups and the chest-open moment](issues/14-pickup-look.md)                   | 06, 07     | M    |
| 15  | [Death, respawn and FX feel](issues/15-death-and-fx.md)                              | 08, 10, 11 | M    |
| 16  | [Decor (cuttable)](issues/16-decor.md)                                               | 09         | S    |
| 17  | [Acceptance](issues/17-acceptance.md)                                                | all        | S    |

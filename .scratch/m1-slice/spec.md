# Spec: Milestone 1, the vertical slice

Status: ready to split
Map: [Doom Maze 3D, the way to a first playable slice](../3d-slice/map.md)

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
- **Seeds.** `?seed=<uint32>&level=<i>` pins a run. Without them, one base seed is drawn at boot with `crypto.getRandomValues` and logged to the console. Each level's seed derives from the base seed, and a level keeps its seed for the whole run. `Math.random` is never used for anything level-visible.
- **Session state.** Coins bank on pickup into an in-memory session total, which survives death and is lost on reload. Keys are per level. There is no `player-db` and no player name.
- **End of slice.** Opening level 1's chest irises onto a DOM card on `INK`: "END OF SLICE", the coin total, and "PRESS ANY KEY". The listener is persistent (not `once`). A key press restarts at level 0 with a fresh base seed, or the same seed if `?seed=` is pinned.
- **Out:** audio, touch, Title / Player / Win scenes, mummies, spikes, dual keys (built for, not exercised).

### Simulation (`src/core`, `src/game`)

- **Steps.** Grid-snap, 120 ms per tile. The hero takes the destination tile at step start, as in v2.
- **`stepPosition(from, to, progress)`.** A pure function in `src/core` that moves linearly at constant speed from one tile centre to the next. It is the only source of a body's mid-step position. Blade contact calls it every tick, and the hero view calls it in `render(alpha)`. "What you see is what kills."
- **Input.** Port `grid-input`: world-relative directions, hold-to-walk, a 180 ms buffer, newest-held-wins, corner assist. Remove the port map's stale "camera-relative" line.
- **Hazards.**
  - Flame: whole-tile lethal while `on`, checked on landing and on go-live (occupant re-check).
  - Blade: contact, checked every tick at mid-step positions against the body capsule (r 0.4, h 1.5), per ADR 0002.
  - All timing comes from `HAZARD_TIMING`, including the new `bladeSpin = 1600`.
  - Phases: seeded per tile with `tileRng`. Blades that share a wall are phase-locked.
- **Death.** Every kill runs the same sequence, driven by timers in `update`:
  1. t = 0: cut the step, set the logical tile to the start tile, set `dying`, facing south. Drop the most recent key; it respawns on its tile with the fade-in pop.
  2. t = 270 ms (`gone`): respawn at the start tile and begin **grace** (1 s, hazards ignore the hero).
  3. t = 530 ms: input unlocks. Held or buffered keys then fire.
- **Pickups.** Checked on step landing in v2's order: coin → key → chest.
  - The chest opens only with all required keys.
  - Landing on the chest without them shows the toast "Find the key first!", every time.
  - The chest opening locks input and starts the `leaving` transition.
- **Events.** The simulation emits typed events (`step`, `landed`, `died`, `respawned`, `coin`, `key`, `keyLost`, `chestLocked`, `chestOpened`, `hazardLive`). Views and the HUD react to events and never read the scene.

### State machine (`src/game/state.ts`)

`loading → playing → leaving → building → entering → playing`, all on `createFixedLoop`.

- **loading**: `#hud` shows "Loading…" on `INK`. Load the GLBs, then `renderer.compileAsync` with the full, fixed light rig.
- **playing**: dying and grace are simulation sub-state here, not machine states.
- **leaving**: chest open, wait 350 ms, iris close.
- **building**: behind full `INK`. Run `planChamber` → set instance counts, rebuild per-level hazard and pickup views, fit the shadow frustum to the map, reset camera lag.
- **entering**: iris open on the hero.
- Set `body[data-ready="true"]` when the first chamber reaches `playing`.
- **Teardown never adds, removes or toggles a light.** The 4 pool slots and the torch persist and drop to intensity 0. InstancedMeshes are reused. Per-level views are disposed.

### Render (`src/render`)

- **Foundation.**
  - `palette.json` gets a `HERO_*` block. `palette.ts` exposes `P`, `LIGHT`, `color()` and `css()`; `blender/scripts/lib/palette.py` reads the same JSON.
  - `look.ts` holds every feel value, with a dev-only lil-gui panel and a frame-time readout.
  - Renderer: `NeutralToneMapping`, DPR capped at 2. EffectComposer with MSAA → bloom (threshold 1.0, strength 0.45) → vignette → `OutputPass`.
  - Lights, fixed: a north-west shadowed key light (55–60°), a hemisphere fill, the torch, 4 pool slots, and a palette-gradient PMREM env map.
- **Chamber.** As in 05: `planChamber` (core) → one `InstancedMesh` per (piece, variant) from `kit/chamber.glb`. The kit adds a `face_slot` variant: `planChamber` picks it for wall tiles north and south of a blade. Padding ring, contact strips, shadow frustum fixed to the map at 2048².
- **Hero.**
  - Pip from `characters/pip.glb` via `loadCharacter()`. The mixer runs on simulation time; `walk` is set to 0.24 s and chained across steps with no blend to idle.
  - Turns take the shortest arc over 60 ms, render-only.
  - Soft `INK` blob shadow and a `CREAM` fresnel rim.
  - The rig plays the hit flash (80 ms `CREAM` emissive), knockback (0.25 m, 110 ms), collapse (160 ms) and respawn pop (260 ms, Back ease).
  - Grace flicker toggles visibility every 80 ms; under reduced motion it becomes a steady boosted rim.
- **Camera.** Follows the interpolated hero position with 0.12 s lag. On death it **holds** on the death spot; at `gone` it **cuts** to the start tile with lag reset.
- **Flame** (07, preset D):
  - Bpy `hazards/flame.glb` (grate and nozzle).
  - A 3.6 m additive shader column, about 36 embers/s through the telegraph, and a 3.4 m additive glow decal.
  - Pool-light allocator: firing flames first, then telegraphing, then nearest to the hero; ~100 ms intensity fades, peak scale 2.
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
  - Hit-stop: 60 ms on key pickup only. None on death.

### HUD and overlays (`src/ui`, DOM in `#hud`)

- **Panels.** v2's `drawPanel` in CSS: `SHADOW` fill at 0.92, a 2 px `INK` border, a 2 px accent on the top and left edges, an `INK` bottom line at 0.6. Fonts are Black Ops One (display) and Pixelify Sans (body) from Google Fonts. All colours come from `css()`.
- **Layout.**
  - Top-left: the "CHAMBER N" title panel.
  - Next to it: the coin panel (`GOLD_DARK` accent) with a coin icon and the session total.
  - Top-right: key slots (1 or 2), empty as `INK`-tinted at 0.75, filled at full colour.
- **Toast.** Centred, `GOLD_LIGHT`. Fades in over 180 ms, holds 900 ms, fades out over 300 ms.
- **Fly-to.** On pickup, project the pickup's world position to the screen once. A DOM sprite flies to the target element's rect over 450 ms (cubic in-out). On landing, the slot or coin pops (scale 1.3 → 1 over 200 ms, Back ease) and a "+1" floats away over 800 ms. The coin total banks at pickup and is displayed when the sprite lands.
- **Damage flash.** A DOM `BLOOD` overlay at 0.22 alpha for 300 ms.
- **Iris.** A DOM `INK` overlay with a radial-gradient mask. It closes on the chest's projected position (420 ms, cubic-in) and opens on the hero (420 ms, cubic-out).
- **Reduced motion** (`prefers-reduced-motion`): no shake, no damage flash, hit-stop capped at 20 ms, the iris is an instant cut, no HUD pops (flights stay), no coin bob or turn, and the steady rim instead of the flicker.

### Dev tooling

- Dev builds only: `window.__game` adds `sim`:
  - read-only state: hero tile, facing, keys, coins, level index, machine state, `dying`, grace
  - `press(dir)` / `release(dir)`, which go through the real input path
  - `pause()` / `advance(ms)`, which step the fixed loop deterministically
- A ground-truth overlay of lethal tiles and the blade contact zone (the prototype's `G`).
- All of it is stripped from production, like lil-gui.

### Acceptance

- `pnpm check` and `pnpm test:e2e` pass.
- Scripted e2e on a pinned seed: walk the route to key and chest, die on a known flame and respawn at the start with the key restored, see level 1 build, reach the end card and restart.
- The human plays levels 0 and 1 on the MacBook: 60 fps at 1080p, DPR 1, bloom on, and signs off the `look.ts` tuning.

## Issues

Tickets live in [`issues/`](issues/). There are two phases: a **greybox spine** (01–08), in which every ticket leaves the game playable with one more thing working, and **art and feel passes** (09–17), which swap the real look in behind a game that already works.

| #   | Ticket                                                                               | Blocked by |
| --- | ------------------------------------------------------------------------------------ | ---------- |
| 01  | [Port the level generator, seed for seed](issues/01-port-generator.md)               | –          |
| 02  | [Light the scene with the fixed rig and post chain](issues/02-light-rig-and-post.md) | –          |
| 03  | [See level 0's chamber](issues/03-see-the-chamber.md)                                | 01, 02     |
| 04  | [Walk the hero through the chamber](issues/04-hero-walks.md)                         | 03         |
| 05  | [Collect coins and the key, shown on the HUD](issues/05-pickups-and-hud.md)          | 04         |
| 06  | [Open the chest and move on to the next level](issues/06-chest-and-transition.md)    | 05         |
| 07  | [Die on flames and respawn](issues/07-flames-kill.md)                                | 04, 05     |
| 08  | [Die on spinning blades by contact](issues/08-blades-kill.md)                        | 07         |
| 09  | [Procedural sandstone kit](issues/09-sandstone-kit.md)                               | 03         |
| 10  | [Pip v1 replaces the capsule](issues/10-pip-v1.md)                                   | 02, 04     |
| 11  | [Pip fidelity pass](issues/11-pip-fidelity.md)                                       | 10         |
| 12  | [Flames read as light](issues/12-flame-look.md)                                      | 02, 07     |
| 13  | [Steel blade and lintels](issues/13-blade-look.md)                                   | 08, 09     |
| 14  | [Gold pickups and the chest-open moment](issues/14-pickup-look.md)                   | 06         |
| 15  | [Death, respawn and FX feel](issues/15-death-and-fx.md)                              | 07, 10     |
| 16  | [Decor (cuttable)](issues/16-decor.md)                                               | 09         |
| 17  | [Acceptance](issues/17-acceptance.md)                                                | all        |

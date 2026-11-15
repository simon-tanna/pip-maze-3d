# 12: Flames read as light

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Flames get their real look: light, not geometry. See the map's hazards ticket (preset D) and lighting-budget ticket.

- A bpy floor grate and nozzle (agent-built, palette inputs). The grate bed heats `EMBER_DARK` → `FIRE_HOT` through the telegraph (sine-in) and cools over 250 ms after. The builder registers with `pnpm assets:build`.
- A shader flame column: an open cone (top r 0.16 m, base r 0.6 m, 3.6 m tall), additive, with a seamless scrolling fbm mapped through `EMBER` → `FIRE` → `FIRE_HOT` → `FIRE_CORE` at HDR gain ≈ 2.4. Ignite is back-out 0.3 → 1 over 120 ms; extinguish collapses to 0.2 over 120 ms.
- Embers rise from the grate through the telegraph (about 36/s).
- An additive radial glow decal (3.4 m): `EMBER` → `FIRE_HOT` through the telegraph, `FIRE` with flicker while live.
- A pool-light allocator for the fixed slots (4, or the fallback ticket 02's bench recorded): firing flames first, then telegraphing, then nearest to the hero; ~100 ms intensity fades, peak scale 2, the telegraph ramping to 0.45 of peak. Intensity-only changes.
- Everything is driven from the core flame state, so visuals never lead or lag the rule.

**Blocked by:** 02, 07

**Status:** ready-for-human

- [x] With the ground-truth overlay on: the ignite starts on the go-live tick and the collapse on the off tick; the column scale is below 0.25 on every frame where the tile is not lethal
- [x] Renderer program count stays flat while flames cycle (no recompiles)
- [x] Game-camera captures of a flame cycle on the shared fixture's seed are linked on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) on flame feel, against prototype preset D. Not needed for agent-complete
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-15: Agent build on `ticket/12-flame-look`. `blender/scripts/build_flame.py` writes `public/models/hazards/flame.glb` (`FLAME_MODEL`; nodes `bed`, `grate`, `nozzle` in a tile's local frame, all under 7 cm so the tile stays walkable). Flat Principled materials named after their palette keys: an `EMBER_DARK` bed, a dark-iron `SHADOW` grate (steel is reserved for blades and spikes, so the prototype's `STEEL_DARK` frame isn't used) and a `STONE_DARK` nozzle ring; no baked atlas, the parts are small and dark. `src/core/hazards.ts` gains `flameClock(t, phase)` (`flameState` plus `intoMs`), and `sim.flames()` reports `intoMs`, so the view animates from the same clock as the rule. `src/render/flame-visual.ts` holds preset D's curves (back-out ignite 0.3 → 1 over 120 ms from the go-live tick, sine-in grate heat, 250 ms cool). `src/render/flames.ts` draws the grate, a per-flame heated bed, the additive fbm shader column (3.6 m, gain 2.4), the 3.4 m glow decal and one shared ember emitter (36/s, render-local `mulberry32`). Nothing but the truth slabs is ever hidden: a quiet flame draws at strength 0, so the boot `compileAsync` sees every program. Per-flame materials come from grow-only pools that are never disposed. `src/render/flame-pools.ts` allocates the 4 pool slots (ticket 02's bench recorded no fallback): firing, then telegraphing (0.45 of peak with the heat), then nearest the hero; linear fades over `poolFadeMs`, and a slot fades out where it stands before it moves to another flame. The light bench now gathers the slots round the hero in `lights.ts`, replacing the start-tile block in `main.ts`, and overrides the allocator while on. Every feel number is in `look.flame`. **Deviation for review:** the ticket asks both for "collapses to 0.2 over 120 ms" and for a column below 0.25 on every non-lethal frame. Both can't hold from full size without the column leading the rule, so on the off tick the column is already at 0.24 (`collapseFrom`) and shrinks to 0.2 while it fades out over 120 ms. Tests: `flame-visual`, `flame-pools`, `flame-model` (GLB contract and palette reservations) and `flames-view` unit tests; `tests/e2e/flame-look.spec.ts` renders tick by tick around a go-live and an off tick with `G` on and checks the ignite and collapse ticks, the < 0.25 rule against the overlay, embers in the telegraph, and a flat program count and rig over a cycle. `tests/e2e/flame-captures.spec.ts` (`CAPTURE=1` only) writes the captures. Game-camera captures, seed 42 (the shared fixture), 1920×1080, dev panel hidden, level 0's flame by the key: [off](../../../docs/art/m1/12-flame-1-off.png), [telegraph](../../../docs/art/m1/12-flame-2-telegraph.png), [ignite](../../../docs/art/m1/12-flame-3-ignite.png), [live](../../../docs/art/m1/12-flame-4-live.png), [collapse](../../../docs/art/m1/12-flame-5-collapse.png), [cooling](../../../docs/art/m1/12-flame-6-cooling.png). For the human: from the game camera the live column blooms into a bright teardrop more than a tall column; `look.flame.gain` and `post.bloomStrength` are the levers. Also fixed a Prettier failure in ticket 10's comments that came in on `main`.

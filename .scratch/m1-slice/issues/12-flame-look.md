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

**Status:** ready-for-agent

- [ ] With the ground-truth overlay on: the ignite starts on the go-live tick and the collapse on the off tick; the column scale is below 0.25 on every frame where the tile is not lethal
- [ ] Renderer program count stays flat while flames cycle (no recompiles)
- [ ] Game-camera captures of a flame cycle on the shared fixture's seed are linked on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) on flame feel, against prototype preset D. Not needed for agent-complete
- [ ] `pnpm check` and `pnpm test:e2e` pass

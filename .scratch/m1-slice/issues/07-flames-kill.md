# 07: Die on flames and respawn

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Flames cycle on v2's timing and kill the hero. The hero dies, respawns at the start tile with grace, and loses the most recent key. See the spec's _Simulation → Hazards/Death_ and the map's hazards ticket. The view is greybox here (a column coloured by state); the real flame look is ticket 12.

- Port the flame half of `HAZARD_TIMING` to core, unchanged (telegraph 500, on 2000, off 2000). The flame cycle is a pure function of time and phase. Phases are seeded per tile with `tileRng`, as in v2.
- Flame kills: whole tile while `on`, checked on landing **and** on go-live (occupant re-check). Grace and `dying` skip the check.
- Death sequence, all as simulation timers in `update`: t = 0, cut the step, logical tile → start, facing south, `dying`, drop the most recent key (it reappears on its own tile); t = 270 ms, respawn and begin the 1 s grace; t = 530 ms, input unlocks and held or buffered keys fire.
- Emit `died`, `respawned`, `keyLost`, `hazardLive`. Expose `dying` and grace through `__game.sim`.
- Dev-only ground-truth overlay of lethal tiles (the hazards prototype's `G`).

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Unit tests: flame states over a full cycle; seeded phases match v2's derivation; the go-live re-check kills a hero standing on the tile; grace and `dying` block kills
- [ ] Unit tests: death timers (270 / 530 ms) and key loss
- [ ] e2e on a pinned seed: step onto a known flame while `on` → hero back on the start tile, key restored to its tile, input locked until 530 ms
- [ ] `pnpm check` and `pnpm test:e2e` pass

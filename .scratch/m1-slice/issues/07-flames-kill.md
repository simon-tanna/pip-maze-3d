# 07: Die on flames and respawn

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Flames cycle on v2's timing and kill the hero. The hero dies, respawns at the start tile with grace, and loses the most recent key. See the spec's _Simulation → Time/Hazards/Death_ and the map's hazards ticket. The view is greybox here (a column coloured by state); the real flame look is ticket 12.

- Port the flame half of `HAZARD_TIMING` to core, unchanged (telegraph 500, on 2000, off 2000). v2's `bladeHalfSwing` and `bladeDangerAngle` are not ported. The flame cycle is a pure function of the level's hazard clock and phase, where phase is a start delay as in v2: `state(t) = t < phase ? off : cycle((t − phase) mod 4500)`. Phases are seeded per tile with `tileRng`, as in v2. The hazard clock starts at 0 when `entering` begins.
- Flame kills: whole tile while `on`, checked on landing **and** on go-live (occupant re-check). Grace and `dying` skip the check. Grace ending triggers no re-check (v2 parity).
- Death sequence, all as simulation timers in `update`: t = 0, cut the step, logical tile → start, facing south, `dying`, drop the most recent key (it reappears on its own tile; losing key 1 also hides an uncollected key 2); t = 270 ms, respawn and begin the 1 s grace; t = 530 ms, input unlocks and held or buffered keys fire. Coins are untouched.
- Emit `died`, `respawned`, `keyLost`, `hazardLive`. Expose `dying` and grace through `__game.sim`, and make `hazardsOff` live.
- Flame views register with ticket 06's per-level teardown.
- Dev-only ground-truth overlay of lethal tiles (the hazards prototype's `G`).

**Blocked by:** 04, 05, 06

**Status:** ready-for-agent

- [ ] Unit tests: flame states over a full cycle; every flame is off for t < phase; seeded phases match v2's derivation; the go-live re-check kills a hero standing on the tile; grace and `dying` block kills; grace ending in a live flame doesn't kill
- [ ] Unit tests: death timers (270 / 530 ms), key loss (including the key-2 hide on a synthetic two-key level), and coins unchanged by death
- [ ] Unit tests: a death and a chest landing on the same tick resolve as death (hazards before pickups, as in v2); a go-live during `leaving` doesn't kill
- [ ] e2e on the shared fixture: step onto a known flame while `on` → hero back on the start tile, key restored to its tile, coins unchanged, input locked until 530 ms, then a held direction walks
- [ ] The light-count and program-count guard from ticket 02 holds across a death-and-grace cycle
- [ ] The renderer program-cache-key check from ticket 06 still holds with flames present
- [ ] The 04–06 e2e tests stay green (with `hazardsOff` where their routes cross a flame)
- [ ] `pnpm check` and `pnpm test:e2e` pass

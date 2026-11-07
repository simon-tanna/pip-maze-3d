# 06: Open the chest and move on to the next level

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** With the key, landing on the chest opens it, the screen irises closed, level 1 builds, and the iris opens on the hero. Opening level 1's chest leads to the end-of-slice card, which restarts the run. See the spec's _State machine_, _Scope and run_ and _HUD and overlays → Iris_.

- State machine on `createFixedLoop`: `loading → playing → leaving → building → entering → playing`. "Loading…" on `INK` while GLBs load and `compileAsync` runs. `body[data-ready="true"]` is set when the first chamber reaches `playing`.
- `leaving`: input locked; 350 ms after the chest opens, a DOM `INK` iris (radial-gradient mask) closes on the chest's projected position over 420 ms (cubic-in). `entering`: it opens on the hero over 420 ms (cubic-out). Under reduced motion it's an instant cut.
- `building` happens behind full `INK`: plan the next chamber, reset instance counts, rebuild per-level views, refit the shadow frustum, reset camera lag. **No light is added, removed or toggled**; the pool slots and torch persist.
- The chest opening here is a simple placeholder (lid snaps open); the full moment is ticket 14.
- End card after level index 1: "END OF SLICE", the coin total, "PRESS ANY KEY", with a persistent (not `once`) listener. Restart at level 0 with a fresh base seed, or the same one if `?seed=` is pinned. Coins reset only on reload.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] e2e on a pinned seed: collect the key, reach the chest, observe `sim` machine state pass through leaving → building → entering, and level index 1 playing
- [ ] e2e: opening level 1's chest shows the end card; a key press restarts at level 0 with the same seed when pinned
- [ ] Renderer program count doesn't grow across a transition (no shader recompiles)
- [ ] `pnpm check` and `pnpm test:e2e` pass

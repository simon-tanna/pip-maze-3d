# 05: Collect coins and the key, shown on the HUD

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The hero picks up coins and the key by landing on them, and the DOM HUD shows the chamber, the coin total and the key slot. See the spec's _Simulation → Pickups/Events_ and _HUD and overlays_. Pickups use greybox meshes here; the gold art is ticket 14.

- Pickups are checked on step landing in v2's order: coin → key → chest. Coins bank immediately into an in-memory session total. Landing on the chest without the key emits the locked event, and the toast "Find the key first!" shows every time.
- Key 2 support is built (v2's dual-key logic: key 2 appears when key 1 is collected) but not exercised: levels 0 and 1 have one key.
- The simulation emits typed events (`landed`, `coin`, `key`, `chestLocked`, …), and the HUD reacts to them, never reading the scene.
- HUD in `#hud`: v2's panel style in CSS (colours from `css()`), Black Ops One and Pixelify Sans from Google Fonts; "CHAMBER N" (N = index + 1) top-left; the coin panel beside it; the key slot top-right.
- Fly-to: at pickup, project the world position to the screen once; a DOM sprite flies to the target element over 450 ms (cubic in-out); then the slot or coin pops (1.3 → 1, 200 ms, Back) and a "+1" floats off for coins. Under reduced motion, the pops are skipped and the flight stays.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Unit tests cover the pickup order on landing, banking on pickup, the chest-locked event, and the key 2 reveal logic
- [ ] e2e on a pinned seed: walking over a coin increments `sim` coins and the HUD count; picking up the key fills the slot; landing on the chest without the key shows the toast
- [ ] The HUD is unaffected by post-processing (it's DOM)
- [ ] `pnpm check` and `pnpm test:e2e` pass

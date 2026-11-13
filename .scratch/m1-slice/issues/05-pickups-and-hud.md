# 05: Collect coins and the key, shown on the HUD

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The hero picks up coins and the key by landing on them, and the DOM HUD shows the chamber, the coin total and the key slot. See the spec's _Simulation → Pickups/Events_ and _HUD and overlays_. Pickups use greybox meshes here; the gold art is ticket 14.

- Pickups are checked on step landing in v2's order: coin → key → chest. Coins bank immediately into an in-memory session total. Landing on the chest without the key emits the locked event, and the toast "Find the key first!" shows every time (in 180 ms, hold 900 ms, out 300 ms).
- Dual keys, built but not exercised (levels 0 and 1 have one key): `requiredKeys`, the key-2 reveal when key 1 is collected, a 2-slot HUD, and v2's rule that losing key 1 hides an uncollected key 2 again (wired to `keyLost` in ticket 07).
- The simulation emits typed events (`step`, `landed`, `coin`, `key`, `chestLocked`, …) whose payloads carry the tile and world position. The HUD reacts to them, never reading the scene, and never imports three.js: `main.ts` injects `project(world)`.
- HUD in `#hud`: v2's panel style in CSS (colours from `css()`), the self-hosted Black Ops One and Pixelify Sans; "CHAMBER N" (N = index + 1) top-left; the coin panel beside it; key slots top-right, empty as `INK`-tinted at 0.75, filled at full colour.
- Fly-to: at pickup, project the world position to the screen once; a DOM sprite flies to the target element over 450 ms (cubic in-out); then the slot or coin pops (1.3 → 1, 200 ms, Back) and a "+1" floats off for coins. A key slot always renders from the simulation's current key count, and in-flight key sprites are cancelled on `keyLost`. Under reduced motion, the pops are skipped and the flight stays.
- `__game.sim` adds `keys` and `coins`.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] Unit tests cover the pickup order on landing, banking on pickup, the chest-locked event, the `step` event, and the key 2 reveal and hide-on-loss logic on a synthetic two-key level
- [x] Unit test: a key flight that lands after the key count dropped leaves the slot empty
- [x] ESLint bars `src/ui/**` from importing `three` and `@render/*`
- [x] e2e on the shared fixture: walking over a coin increments `sim` coins and the HUD count; picking up the key fills the slot; landing on the chest without the key shows the toast, and its opacity follows 180 / 900 / 300 ms
- [x] e2e: an empty slot shows the 0.75 `INK` tint and a filled one doesn't
- [x] e2e with `prefers-reduced-motion` emulated: the pop scale stays 1 and the flight still runs
- [x] The HUD is unaffected by post-processing (it's DOM)
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-14 (agent, branch `ticket/05-pickups-and-hud`): pickup rules in `@core/pickups`, driven by `createSim({ map, machine, pickups, session })`; `sim.dropKey()` is ready for 07. HUD is `src/ui/hud.ts` (+ `key-slots.ts`, `tweens.ts`), timed on render-interpolated sim time, tunables in `look.hud`; greybox pickups in `@render/pickups`. E2e: `tests/e2e/pickups-hud.spec.ts`, using the new `LEVEL_0.chestWithoutKey` route. `DEV_PORT` lets each worktree run its own e2e server.

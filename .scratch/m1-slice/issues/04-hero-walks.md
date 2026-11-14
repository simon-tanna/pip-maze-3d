# 04: Walk the hero through the chamber

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** A capsule hero walks the chamber on the grid with the arrow keys or WASD, the camera following it. This ticket also lands the dev simulation hook and the shared e2e fixture, so this and every later ticket can be verified by e2e. See the spec's _Simulation_ and _Dev tooling_, and the map's camera ticket.

- Port v2's `grid-input`: world-relative 1:1 directions, hold-to-walk, a 180 ms buffer, newest-held-wins, corner assist. A key into a wall does nothing (no move, no turn). Buffer age is measured in simulation time. Keep v2's clear-on-blur and `!event.repeat` filter, and expose `clear()` for the chest and restart. Fix the stale "camera-relative" line in `docs/v2-port-map.md`.
- Grid-snap steps of 120 ms, on the spec's _Simulation → Time_ rules: a chained step carries its overshoot, and timers fire on the first tick at or after their threshold. The hero takes the destination tile at step start.
- **A pure `stepPosition(from, to, progress)` in core** (linear, constant speed, tile centre to tile centre) is the only source of mid-step position. The view calls it in `render(alpha)`, and blade contact will call it later.
- The capsule turns to face each step by the shortest arc over 60 ms (render-only). The camera follows the interpolated position with 0.12 s exponential lag and a 1 m lead along facing.
- A minimal `src/game/state.ts` (`loading → building → entering → playing`, with instant transitions for now), which ticket 06 extends.
- `FixedLoop` gains `paused` and `step(ms)`: `step` runs `ceil(ms / 1000 · 60)` update ticks directly, bypassing the 0.25 s frame clamp, then one render.
- Dev-only `window.__game.sim`: read-only state (hero tile, facing, machine state, level time), `press(dir)` / `release(dir)` through the real input path, `pause()` (stops the rAF-driven advance) / `advance(ms)` (calls `step`), and `hazardsOff(bool)` (a no-op until 07). Stripped from production.
- **Shared e2e fixture** in `tests/e2e/fixtures/`: one pinned seed with a level-0 route (start → coin → key → chest) and a level-1 route, as press sequences. Every later e2e uses it.

**Blocked by:** 03

**Status:** resolved

- [x] `stepPosition` unit tests: endpoints, constant speed, and progress clamped to 0–1
- [x] Step timing unit test: 10 chained held steps take 1200 ms ± 1 tick
- [x] Input unit tests cover the buffer (aged in sim time), newest-held-wins, corner assist, blocked keys, blur-clear and ignored repeats
- [x] `FixedLoop` unit tests: `step(1000)` runs 60 updates despite the clamp; nothing advances while `paused`
- [x] e2e on the shared fixture: scripted presses walk the level-0 route and the hero ends on the expected tile; a press into a wall leaves tile and facing unchanged
- [x] e2e: the camera lead is 1 m along facing after a step, and the lag settles within 0.6 s (read through `__game.camera`)
- [x] `__game.sim` is absent from `pnpm build` output
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-14 (agent, branch `ticket/04-hero-walks`): Done. `@core/step` (`stepPosition`, `STEP_MS`), `@core/grid-input` (pure port; `Dir` is `north|east|south|west`), `@game/keyboard` (DOM binding), `@game/sim` (`createSim({ map, machine })`, emits `step`/`landed`), `@game/state` (minimal machine), `@render/camera-rig`, `@render/hero`, `look.hero.turnMs`. Camera lag and hero turns run on render-time sim ms (`sim.timeAt(alpha)`), so `pause`/`advance` are deterministic. Shared fixture: `tests/e2e/fixtures/{routes,game}.ts`, base seed 42; `tests/unit/e2e-routes.test.ts` replays both routes on the real sim. Added the spec's ESLint rule (`src/game` may not import three, `@render`, `@ui`) and raised Playwright's per-test timeout to 60 s (the double-boot chamber spec timed out at 30 s on `main` too).

- 2026-11-14: Resolved. Merged into `main` (milestone-1 greybox spine, tickets 01–08); a code-review fix pass followed (`fix/code-review`, adc9908). On `main`: `pnpm check` (261 unit tests) and `pnpm test:e2e` (35/35) pass.

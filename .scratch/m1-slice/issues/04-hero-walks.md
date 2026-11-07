# 04: Walk the hero through the chamber

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** A capsule hero walks the chamber on the grid with the arrow keys or WASD, the camera following it. This ticket also lands the dev simulation hook, so this and every later ticket can be verified by e2e. See the spec's _Simulation_ and _Dev tooling_, and the map's camera ticket.

- Port v2's `grid-input`: world-relative 1:1 directions, hold-to-walk, a 180 ms buffer, newest-held-wins, corner assist. A key into a wall does nothing (no move, no turn). Fix the stale "camera-relative" line in `docs/v2-port-map.md`.
- Grid-snap steps of 120 ms. The hero takes the destination tile at step start.
- **A pure `stepPosition(from, to, progress)` in core** (linear, constant speed, tile centre to tile centre) is the only source of mid-step position. The view calls it in `render(alpha)`, and blade contact will call it later.
- The capsule turns to face each step by the shortest arc over 60 ms (render-only). The camera follows the interpolated position with 0.12 s exponential lag and a 1 m lead along facing.
- Dev-only `window.__game.sim`: read-only state (hero tile, facing, machine state), `press(dir)` / `release(dir)` through the real input path, and `pause()` / `advance(ms)` to step the fixed loop deterministically. Stripped from production.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `stepPosition` unit tests: endpoints, constant speed, and progress clamped to 0–1
- [ ] Input unit tests cover the buffer, newest-held-wins, corner assist and blocked keys
- [ ] e2e on a pinned seed: scripted presses walk a known route and the hero ends on the expected tile; a press into a wall leaves tile and facing unchanged
- [ ] `__game.sim` is absent from `pnpm build` output
- [ ] `pnpm check` and `pnpm test:e2e` pass

# 06: Open the chest and move on to the next level

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** With the key, landing on the chest opens it, the screen irises closed, level 1 builds, and the iris opens on the hero. Opening level 1's chest leads to the end-of-slice card, which restarts the run. See the spec's _State machine_, _Scope and run_ and _HUD and overlays → Iris_.

- Extend ticket 04's `state.ts` to the full machine on `createFixedLoop`: `loading → building → entering → playing → leaving → building …`, `leaving → ended` after the last slice level, `ended → building(level)` on restart, and `failed` on any load error (`body[data-ready="error"]`, the error shown in `#hud`). "Loading…" on `INK` while GLBs load. `body[data-ready="true"]` is set when the first chamber reaches `playing`.
- **Layering:** `state.ts` imports nothing from `render`, `ui` or `three`. It declares `ChamberView { build(level); precompile() }`, `Transition { close(at); open(at) }` and `CameraRig { resetLag() }`; `main.ts` wires them. Add the ESLint rule: `src/game/**` may not import `@render/*`, `@ui/*` or `three`, and `@render` / `@ui` may not import each other.
- `building` happens behind full `INK`, for level 0 too: plan the chamber, reset instance counts, rebuild per-level views, refit the shadow frustum, reset camera lag. After the first build, `compileAsync` runs once with every view and pooled object in the scene. Materials are module-scoped and shared; teardown disposes only per-level geometry and Object3Ds. Per-level views register with a teardown list that tickets 07 and 08 add to. **No light is added, removed or toggled**; the pool slots and torch persist.
- `leaving`: grid input is cleared and locked; 350 ms after the chest opens, a DOM `INK` iris (radial-gradient mask) closes on the chest's projected position over 420 ms (cubic-in). `entering`: it opens on the hero over 420 ms (cubic-out), the hazard clock starts, and input unlocks when it completes. Under reduced motion it's an instant cut.
- The chest opening here is a simple placeholder (lid snaps open) and emits `chestOpened`; the full moment is ticket 14.
- `ended`: the end card after level index 1: "END OF SLICE", the coin total, "PRESS ANY KEY". Keys reset, coins are kept, input is cleared. The listener is persistent (not `once`), acts only while `state === ended`, ignores repeats and consumes its key. Restart at the pinned `level` with the same seed if `?seed=` is pinned, otherwise at level 0 with a fresh base seed. Coins reset only on reload.
- `__game.sim` adds `levelIndex`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Unit tests for `state.ts` transitions, including `ended` and `failed`, with fake `ChamberView` / `Transition` implementations
- [ ] e2e on the shared fixture: collect the key, reach the chest, observe `sim` machine state pass through leaving → building → entering, and level index 1 playing
- [ ] e2e: presses during leaving, building and entering don't move the hero; a direction held through the iris doesn't walk on arrival
- [ ] e2e: opening level 1's chest shows the end card (`sim` state `ended`); a key press restarts with the same seed when pinned; a second restart works too; a held arrow from the last step doesn't restart
- [ ] e2e unpinned: a restart logs a new base seed, and level 1's seed is stable within a run
- [ ] The set of `renderer.info.programs` cache keys is identical before and after a transition, and no program compiles in the first 10 frames of `entering`
- [ ] `renderer.info.memory` geometries and textures return to their level-0 baseline after level 0 → 1 → restart
- [ ] e2e with `prefers-reduced-motion` emulated: the iris is an instant cut
- [ ] A forced GLB 404 reaches `data-ready="error"`
- [ ] `pnpm check` and `pnpm test:e2e` pass

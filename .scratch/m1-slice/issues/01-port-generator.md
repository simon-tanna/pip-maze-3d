# 01: Port the level generator, seed for seed

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** v2's level generator runs in `src/core` and produces exactly the same levels as v2 for the same index and seed: map, start, key(s), chest, hazards, coins and `isFair`. Everything level-visible in the game depends on this, so parity is proven before anything is built on top.

Follow the repo's porting rule: port v2's baseline fixture test (`tests/generator-coins.test.mjs` and `tests/fixtures/generator-baseline.json` in `../pip-maze-v-2`) to Vitest **first**, watch it fail, then port the code. Strict TS, no three.js, no DOM. Reuse `@core/grid` (`tileKey`) instead of re-deriving it. Keep every exported helper the slice needs later: `mulberry32`, `tileRng`, `criticalPath`, `LEVEL_CONFIGS`, `SPAWN_SAFE_RADIUS`, `REST_GAP`.

- **The v2 baseline predates coins.** It holds `map`, `key`, `key2`, `traps` and the exit only, and v2 tests coins by property, not position. Before porting, add a local script (in this repo, run with Node against `../pip-maze-v-2`'s generator; v2 itself is not modified) that writes a second fixture with `coins` and the `isFair` route for the same 72 (index, seed) pairs. Commit it beside the ported baseline.
- Add the pure `levelSeed(base, i)` from the spec's _Scope and run → Seeds_.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The ported fixture test passes for every baseline level, field for field
- [ ] The coins-and-route fixture passes field for field: coin positions and the `isFair` route match v2 exactly
- [ ] `generateLevel(i, seed)` is pure and deterministic (same input, deep-equal output)
- [ ] The generator stream is unchanged: coins still come from their own salted RNG
- [ ] `levelSeed` unit tests: `levelSeed(b, 0) === b`; deterministic; uint32 output; distinct for i = 1, 2
- [ ] `docs/v2-port-map.md` marks the generator as ported
- [ ] `pnpm check` passes

# 01: Port the level generator, seed for seed

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** v2's level generator runs in `src/core` and produces exactly the same levels as v2 for the same index and seed: map, start, key(s), chest, hazards, coins and `isFair`. Everything level-visible in the game depends on this, so parity is proven before anything is built on top.

Follow the repo's porting rule: port v2's baseline fixture test (`tests/generator-coins.test.mjs` and `tests/fixtures/generator-baseline.json` in `../pip-maze-v-2`) to Vitest **first**, watch it fail, then port the code. Strict TS, no three.js, no DOM. Reuse `@core/grid` (`tileKey`) instead of re-deriving it. Keep every exported helper the slice needs later: `mulberry32`, `tileRng`, `criticalPath`, `LEVEL_CONFIGS`, `SPAWN_SAFE_RADIUS`, `REST_GAP`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The ported fixture test passes for every baseline level, field for field
- [ ] `generateLevel(i, seed)` is pure and deterministic (same input, deep-equal output)
- [ ] The generator stream is unchanged: coins still come from their own salted RNG
- [ ] `docs/v2-port-map.md` marks the generator as ported
- [ ] `pnpm check` passes

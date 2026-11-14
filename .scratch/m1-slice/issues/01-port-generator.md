# 01: Port the level generator, seed for seed

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** v2's level generator runs in `src/core` and produces exactly the same levels as v2 for the same index and seed: map, start, key(s), chest, hazards, coins and `isFair`. Everything level-visible in the game depends on this, so parity is proven before anything is built on top.

Follow the repo's porting rule: port v2's baseline fixture test (`tests/generator-coins.test.mjs` and `tests/fixtures/generator-baseline.json` in `../pip-maze-v-2`) to Vitest **first**, watch it fail, then port the code. Strict TS, no three.js, no DOM. Reuse `@core/grid` (`tileKey`) instead of re-deriving it. Keep every exported helper the slice needs later: `mulberry32`, `tileRng`, `criticalPath`, `LEVEL_CONFIGS`, `SPAWN_SAFE_RADIUS`, `REST_GAP`.

- **The v2 baseline predates coins.** It holds `map`, `key`, `key2`, `traps` and the exit only, and v2 tests coins by property, not position. Before porting, add a local script (in this repo, run with Node against `../pip-maze-v-2`'s generator; v2 itself is not modified) that writes a second fixture with `coins` and the `isFair` route for the same 72 (index, seed) pairs. Commit it beside the ported baseline.
- Add the pure `levelSeed(base, i)` from the spec's _Scope and run → Seeds_.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The ported fixture test passes for every baseline level, field for field
- [x] The coins-and-route fixture passes field for field: coin positions and the `isFair` route match v2 exactly
- [x] `generateLevel(i, seed)` is pure and deterministic (same input, deep-equal output)
- [x] The generator stream is unchanged: coins still come from their own salted RNG
- [x] `levelSeed` unit tests: `levelSeed(b, 0) === b`; deterministic; uint32 output; distinct for i = 1, 2
- [x] `docs/v2-port-map.md` marks the generator as ported
- [x] `pnpm check` passes

## Comments

- 2026-11-14 (agent): Landed `src/core/generator.ts` (strict-TS port of v2's `lib/generator.js`, draw order unchanged) and `tests/unit/generator.test.ts`. Fixtures: `tests/fixtures/generator-baseline.json` (copied from v2) and `tests/fixtures/generator-coins-route.json`, written by `node scripts/make-generator-fixtures.mjs [path/to/pip-maze-v-2]` (default `../pip-maze-v-2`). All 72 pairs match field for field, and v2's coin property tests are ported too. Also exported: `levelSeed`, `mulberry32`, `tileRng`, `criticalPath`, `LEVEL_CONFIGS`, `SPAWN_SAFE_RADIUS`, `REST_GAP`, `bfsPath`, `tilesWithin`, `safeRoute`, `measureLevel`, and the `Level` / `Trap` / `Tile` types. Deviations: `generateLevel` throws instead of returning `null` in v2's unreachable last-resort branch; `tests/fixtures` is in `.prettierignore` so the JSON stays byte-identical to v2's.

- 2026-11-14: Resolved. Merged into `main` (milestone-1 greybox spine, tickets 01–08); a code-review fix pass followed (`fix/code-review`, adc9908). On `main`: `pnpm check` (261 unit tests) and `pnpm test:e2e` (35/35) pass.

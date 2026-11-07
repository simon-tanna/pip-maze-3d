# 14: Gold pickups and the chest-open moment

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Key, coin and chest become gold props that glow without real lights, and opening the chest becomes a moment. See the spec's _Render → Pickups_ and ADR 0001.

- One bpy pickups GLB with nodes `key`, `coin`, `chest` and `chest_lid`: `GOLD` / `GOLD_LIGHT` metal, subtle `GOLD_LIGHT` emissive that blooms, and an additive floor glow decal under each. No PointLights.
- Key (~0.6 m) floats ~0.5 m up, bobs 0.12 m over 900 ms (sine yoyo) and turns once every 3 s. Coin (~0.4 m): the same bob, plus a turn with a seeded phase (render-local RNG). Chest (~1.2 m): emissive pulse over 900 ms (yoyo).
- Chest open (replacing ticket 06's placeholder): squash (1.2, 0.8) 80 ms → (0.9, 1.2) 140 ms → (1, 1) 120 ms; lid to ~110° over 220 ms; emissive burst; 160 ms shake.
- Key fade-in for reveal and respawn: from scale 0.4 over 500 ms (Back).
- Under reduced motion: no bob or turn, no shake.
- Sizes and motion values live in the look module.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A Vitest check parses the pickups GLB for the four named nodes
- [ ] The light count is unchanged (no pickup lights)
- [ ] Human sign-off on the chest-open moment and pickup read
- [ ] `pnpm check` and `pnpm test:e2e` pass

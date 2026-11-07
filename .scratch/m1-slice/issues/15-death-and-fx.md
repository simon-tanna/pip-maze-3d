# 15: Death, respawn and FX feel

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Dying, respawning and collecting feel like v2, translated to 3D. See the spec's _Render → Hero/Camera/FX_, _HUD and overlays_, and the hero ticket's behaviour table.

- On the rig: an 80 ms `CREAM` emissive hit flash; knockback 0.25 m opposite facing (110 ms, cubic-out); collapse (160 ms, cubic-in) → gone; the respawn pop from scale 0.4 (260 ms, Back). The grace flicker toggles visibility every 80 ms; under reduced motion, a steady boosted rim instead.
- Screen: a DOM `BLOOD` flash at 0.22 alpha over 300 ms; positional camera shake for 120 ms on death (amplitude in the look module). No hit-stop on death; a 60 ms hit-stop on key pickup.
- Camera: holds on the death spot through the collapse, then **cuts** to the start tile at `gone` with lag reset.
- Particles: pooled, instanced, camera-facing quads simulated in render with a render-local seeded RNG. Dust (`SAND` / `STONE_LIGHT`) ×3 on landing and ×6 on respawn; puff ×10 on death; sparkle (`GOLD_LIGHT`) key ×16, coin ×8, chest ×28, key fade-in ×10. Counts and lifetimes start at v2's `createWorldFx`.
- Reduced motion: no shake, no damage flash, hit-stop capped at 20 ms; particles stay.

**Blocked by:** 07, 10

**Status:** ready-for-agent

- [ ] The visual sequence lines up with the simulation timers (respawn pop at 270 ms, input at 530 ms), and the rig never drives timing
- [ ] Every reduced-motion rule is verified by e2e with `prefers-reduced-motion` emulated
- [ ] Particles never use `Math.random`, and screenshots of a pinned seed are stable
- [ ] Human sign-off on death and respawn feel
- [ ] `pnpm check` and `pnpm test:e2e` pass

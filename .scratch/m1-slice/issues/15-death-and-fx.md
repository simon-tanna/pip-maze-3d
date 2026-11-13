# 15: Death, respawn and FX feel

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Dying, respawning and collecting feel like v2, translated to 3D. See the spec's _Render → Hero/Camera/FX_, _Simulation → Hit-stop_, _HUD and overlays_, and the hero ticket's behaviour table. Build on the slot names and bone layout ticket 11 froze.

- On the rig: an 80 ms `CREAM` emissive hit flash; knockback 0.25 m opposite facing (110 ms, cubic-out); collapse (160 ms, cubic-in) → gone; the respawn pop from scale 0.4 (260 ms, Back). The grace flicker toggles the hero mesh's visibility every 80 ms, never a node that has a light under it; under reduced motion, a steady boosted rim instead.
- Screen: a DOM `BLOOD` flash at 0.22 alpha over 300 ms; positional camera shake for 120 ms on death (amplitude in the look module).
- Hit-stop is a simulation concern (spec's _Simulation → Hit-stop_): on key pickup the loop skips 4 update ticks (1 under reduced motion), and the view freezes with sim time. None on death.
- Camera: holds on the death spot through the collapse, then **cuts** to the start tile at `gone` with lag reset. This must hold for a mid-step blade death too, not just a tile-centre flame death.
- Particles: pooled, instanced, camera-facing quads simulated in render with a render-local seeded RNG. Dust (`SAND` / `STONE_LIGHT`) ×3 on landing and ×6 on respawn; puff ×10 on death; sparkle (`GOLD_LIGHT`) key ×16, coin ×8, chest ×28, key fade-in ×10. Counts and lifetimes start at v2's `createWorldFx`.
- Reduced motion: no shake, no damage flash, hit-stop capped at 1 tick; particles stay.

**Blocked by:** 08, 10, 11

**Status:** ready-for-agent

- [ ] The visual sequence lines up with the simulation timers (respawn pop at 270 ms, input at 530 ms), and the rig never drives timing
- [ ] Unit test: a key pickup skips exactly 4 update ticks, and the hazard clock doesn't advance during them
- [ ] e2e: a mid-step blade death holds the camera on the death spot, then cuts to the start tile at 270 ms
- [ ] The light-count guard holds through a grace flicker
- [ ] Each reduced-motion rule here (no shake, no flash, 1-tick hit-stop, steady rim) is verified by e2e with `prefers-reduced-motion` emulated, against the shake offset, flash opacity, skipped-tick count and rim value
- [ ] Particles never use `Math.random`, and screenshots of a pinned seed are stable
- [ ] Human sign-off (a dated line under `## Comments`) on death and respawn feel, against v2 played side by side. Not needed for agent-complete
- [ ] `pnpm check` and `pnpm test:e2e` pass

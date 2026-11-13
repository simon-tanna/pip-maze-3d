# 02: Light the scene with the fixed rig and post chain

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The scaffold scene is lit and post-processed the way the slice will be, and every colour and feel value comes from its single source. See the spec's _Render → Foundation_ and ADR 0001.

- The palette becomes one JSON file read by both TS and bpy. It includes v2's Torchlit Sandstone `P` / `LIGHT` and the new reserved `HERO_*` block, with starting values sampled from `docs/art/pip-concept.png` and `HERO_HAT` a distinct hue from `MOSS`. TS gets `P`, `LIGHT`, `color()` and `css()`; bpy gets linear RGB.
- Feel values live in one look module, split into per-domain sections (camera, hud, flame, blade, pickups, fx, hero) that each register with the panel, so later tickets add a section rather than edit a shared block. A dev-only lil-gui panel and a frame-time readout that can log a summary (mean, p95, worst, frames over 33 ms).
- `NeutralToneMapping`, DPR capped at 2. EffectComposer on a 4-sample `HalfFloatType` render target sized by DPR; the canvas drops `antialias: true`. Then bloom (threshold 1.0, strength 0.45) → vignette → `OutputPass`.
- The fixed light rig: a shadowed north-west key light (55–60°), a hemisphere fill, the torch, and **4 flame-pool slots that always exist** (intensity 0 when idle), plus a palette-gradient PMREM env map. Every light is a direct child of the scene. Precompile with `renderer.compileAsync`.
- **Light bench:** a dev-panel toggle drives all 4 pool slots at peak over a chamber-sized greybox, so the light budget from ticket 03 of the map can be measured.
- **Fonts:** self-host Black Ops One and Pixelify Sans (OFL) under `public/fonts/`, with their licences.
- **`pnpm assets:build`:** one command that runs every procedural bpy builder (placeholders now; each art ticket registers its builder), so a palette change can rebuild every GLB.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] No hex or RGB colour literal remains outside the palette JSON, in TS or Python (the scaffold's literals are gone)
- [ ] Feel values appear only in the look module, and the dev panel and readout are absent from `pnpm build` output
- [ ] A unit or e2e check asserts the renderer config: `NeutralToneMapping`, pixel ratio ≤ 2, a 4-sample composer target, bloom threshold and strength from `look`
- [ ] No light is ever added, removed or toggled after boot: a guard asserts the per-frame collected light count and `renderer.info.programs.length` stay constant (ticket 07 extends it across a death-and-grace cycle)
- [ ] CLAUDE.md's note that the scaffold still uses ACES is removed
- [ ] Light bench on the human's MacBook (1080p, DPR 1, bloom on, 4 pool lights at peak): the logged summary is recorded on this ticket. Pass: p95 ≤ 16.7 ms. On a miss, the fallback (2 pool slots, or peak scale lowered until it passes) is decided and recorded here before ticket 12 starts
- [ ] `pnpm assets:build` rebuilds the placeholders headlessly
- [ ] `pnpm check` and `pnpm test:e2e` pass

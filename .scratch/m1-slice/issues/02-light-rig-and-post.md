# 02: Light the scene with the fixed rig and post chain

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The scaffold scene is lit and post-processed the way the slice will be, and every colour and feel value comes from its single source. See the spec's _Render → Foundation_ and ADR 0001.

- The palette becomes one JSON file read by both TS and bpy. It includes v2's Torchlit Sandstone `P` / `LIGHT` and the new reserved `HERO_*` block, with starting values sampled from `docs/art/pip-concept.png` and `HERO_HAT` a distinct hue from `MOSS`. TS gets `P`, `LIGHT`, `color()` and `css()`; bpy gets linear RGB.
- Feel values live in one look module, with a dev-only lil-gui panel and a frame-time readout.
- `NeutralToneMapping`, DPR capped at 2. EffectComposer with MSAA → bloom (threshold 1.0, strength 0.45) → vignette → `OutputPass`.
- The fixed light rig: a shadowed north-west key light (55–60°), a hemisphere fill, the torch, and **4 flame-pool slots that always exist** (intensity 0 when idle), plus a palette-gradient PMREM env map. Precompile with `renderer.compileAsync`.
- **Light bench:** a dev-panel toggle drives all 4 pool slots at peak over a chamber-sized greybox, so the light budget from ticket 03 of the map can be measured.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] No hex or RGB colour literal remains outside the palette JSON, in TS or Python (the scaffold's literals are gone)
- [ ] Feel values appear only in the look module, and the dev panel and readout are absent from `pnpm build` output
- [ ] No light is ever added, removed or toggled after boot; a test or assertion guards the light count
- [ ] CLAUDE.md's note that the scaffold still uses ACES is removed
- [ ] The light-bench frame times on the human's MacBook (1080p, DPR 1, bloom on, 4 pool lights at peak) are recorded on this ticket
- [ ] `pnpm check` and `pnpm test:e2e` pass

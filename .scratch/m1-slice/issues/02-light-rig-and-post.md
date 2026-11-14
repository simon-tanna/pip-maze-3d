# 02: Light the scene with the fixed rig and post chain

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The scaffold scene is lit and post-processed the way the slice will be, and every colour and feel value comes from its single source. See the spec's _Render → Foundation_ and ADR 0001.

- The palette becomes one JSON file read by both TS and bpy. It includes v2's Torchlit Sandstone `P` / `LIGHT` and the new reserved `HERO_*` block, with starting values sampled from `docs/art/pip-concept.png` and `HERO_HAT` a distinct hue from `MOSS`. TS gets `P`, `LIGHT`, `color()` and `css()`; bpy gets linear RGB.
- Feel values live in one look module, split into per-domain sections (camera, hud, flame, blade, pickups, fx, hero) that each register with the panel, so later tickets add a section rather than edit a shared block. A dev-only lil-gui panel and a frame-time readout that can log a summary (mean, p95, worst, frames over 33 ms).
- `NeutralToneMapping`, DPR capped at 1 (was 2; changed 2026-11-14 after DPR 2 measured ~51 ms/frame on an M3). EffectComposer on a 4-sample `HalfFloatType` render target sized by DPR; the canvas drops `antialias: true`. Then bloom (threshold 1.0, strength 0.45) → vignette → `OutputPass`.
- The fixed light rig: a shadowed north-west key light (55–60°), a hemisphere fill, the torch, and **4 flame-pool slots that always exist** (intensity 0 when idle), plus a palette-gradient PMREM env map. Every light is a direct child of the scene. Precompile with `renderer.compileAsync`.
- **Light bench:** a dev-panel toggle drives all 4 pool slots at peak over a chamber-sized greybox, so the light budget from ticket 03 of the map can be measured.
- **Fonts:** self-host Black Ops One and Pixelify Sans (OFL) under `public/fonts/`, with their licences.
- **`pnpm assets:build`:** one command that runs every procedural bpy builder (placeholders now; each art ticket registers its builder), so a palette change can rebuild every GLB.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] No hex or RGB colour literal remains outside the palette JSON, in TS or Python (the scaffold's literals are gone)
- [x] Feel values appear only in the look module, and the dev panel and readout are absent from `pnpm build` output
- [x] A unit or e2e check asserts the renderer config: `NeutralToneMapping`, pixel ratio ≤ 1 (was ≤ 2), a 4-sample composer target, bloom threshold and strength from `look`
- [x] No light is ever added, removed or toggled after boot: a guard asserts the per-frame collected light count and `renderer.info.programs.length` stay constant (ticket 07 extends it across a death-and-grace cycle)
- [x] CLAUDE.md's note that the scaffold still uses ACES is removed
- [ ] Light bench on the human's MacBook (1080p, DPR 1, bloom on, 4 pool lights at peak): the logged summary is recorded on this ticket. Pass: p95 ≤ 16.7 ms. On a miss, the fallback (2 pool slots, or peak scale lowered until it passes) is decided and recorded here before ticket 12 starts
- [x] `pnpm assets:build` rebuilds the placeholders headlessly
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

**2026-11-14, agent (`ticket/02-light-rig-and-post`):** landed.

- Palette: `src/render/palette.json` holds v2's `P`/`LIGHT` plus `HERO_*` sampled from the concept. `HERO_HAT` `#706a3d` sits about 45° of hue from `MOSS`. Extra slots: `HERO_HAT_BAND`, `HERO_HAIR`, `HERO_BOOT`, `HERO_SCAR`. `LIGHT` entries may name a `P` colour. Added `LIGHT.KEY` = `SAND`, because v2 had no key-light colour. `palette.ts` gives `P`, `LIGHT`, `color()` and `css()`. `lib/palette.py` gives linear `rgb()`/`rgba()`, which Vitest cross-checks against three. CSS reads `--ink` etc., which `main.ts` sets. `tests/unit/no-colour-literals.test.ts` scans `src`, `blender/scripts` and `index.html`.
- **Deviation:** look is a directory, `src/render/look/` (one file per domain, plus `registry.ts` and `index.ts`), not a single `look.ts`, so parallel tickets each add a file plus one line in `index.ts`. Sections so far: `renderer`, `post`, `lights`, `camera`, `bench`. `hud`, `flame`, `blade`, `pickups`, `fx` and `hero` get added by their own tickets via `section(name, values, ranges)`.
- The dev panel (`dev-panel.ts`, lil-gui) and the frame-time readout are dynamically imported under `import.meta.env.DEV`. `tests/unit/build-output.test.ts` makes a production build and asserts both are absent.
- `tests/e2e/render-foundation.spec.ts` covers the renderer config and the rig guard (baseline: 7 lights). I checked that the guard test fails when a pool light's `visible` is toggled.
- The scaffold scene is now a 40×15 instanced greybox (v2's map size) with the capsule hero mid-map. The pool slots sit on four tiles around the hero for the bench. The key light's shadow frustum is fitted to the map (2048²).
- `pnpm assets:build` runs every `blender/scripts/build_*.py`. A builder registers just by following that naming pattern.
- **Light bench, agent measurement.** Setup: Apple M3, Chromium via Playwright, ANGLE Metal, 1920×1080, DPR 1, bloom on, 10 s windows. Frame time is the rAF delta.
  - Headless, 4 pools at peak: `{"frames":600,"meanMs":16.67,"p95Ms":16.7,"worstMs":16.8,"over33":0}`. Idle pools gave identical numbers.
  - Headed, 4 pools at peak: `{"frames":600,"meanMs":16.67,"p95Ms":17.5,"worstMs":17.8,"over33":0}`. Idle pools gave the same p95 of 17.5, so the miss comes from rAF timing jitter at the 60 Hz vsync cap, not from light cost.
  - Both runs are vsync-locked, so they show headroom but not GPU time. For the human: a rAF-delta p95 can sit just above 16.7 ms from jitter alone. Compare bench on against bench off rather than treating 16.7 as a hard line. The human's MacBook run and the pass/fallback decision are still open.

- 2026-11-14: **DPR cap lowered from 2 to 1** (human decision, branch `fix/frame-time`). In real Chrome on the M3, a Retina (DPR 2) screen ran at a 51 ms mean and p95 84 ms: the 4× MSAA HalfFloat target and bloom are fill-bound at 4× the pixels. With the cap at 1 it runs at a 16.6 ms mean and p95 17.3 ms. The agent measurement above was at DPR 1, so it never showed this.

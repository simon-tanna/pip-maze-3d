# What lighting and shadow budget does three r187 allow for torch + flame lights?

Type: research
Status: resolved
Blocked by:

## Question

In three.js r187 (WebGLRenderer), what does each shadow-casting PointLight cost? Roughly how many dynamic point lights can a forward renderer handle before frame time suffers on a mid-range laptop iGPU? What are the options for many small flame lights: unshadowed point lights, light pooling (nearest-N to the hero), baked or fake light via emissive and sprites? Note r187 changes (`PCFSoftShadowMap` removed, `PCFShadowMap` in use). Is WebGPURenderer worth considering now? Level 0 has around 10 hazards, about half of them flames. Produce concrete numbers and a recommended pattern.

## Answer

Full findings: `docs/research/lighting-budget.md` on branch `research/lighting-budget` (local only, never merged).

- **One shadow caster**: the top-left DirectionalLight, plus an unshadowed HemisphereLight fill. A shadowed PointLight costs 6 depth passes, one of WebGL2's 16 guaranteed texture units, and 5 cube taps per fragment.
- **Hero torch**: one unshadowed PointLight with distance about 8–10 m. A shadowed torch, if ever wanted, is a quality setting picked at startup, never toggled during play.
- **Flame light pool**: a fixed pool of 4 unshadowed PointLights, created at level load and always `visible`, sitting at intensity 0 when idle. Precompile with `renderer.compileAsync`. Each frame, give slots to firing flames, then telegraphing ones, then the nearest to the hero, and fade over about 100 ms. Reason: the shader program is keyed on light count, shadow count and shadow type, so adding, removing or toggling a light (`visible`, `castShadow`) recompiles every lit material. Changing intensity, colour or position is just a uniform update.
- **Every flame also fakes its light**: emissive mesh, additive glow sprite, additive floor/wall decal, all driven by `HAZARD_TIMING`.
- **Budget**: about 4–8 unshadowed lights is comfortable on a mid-range iGPU; it starts to hurt beyond about 12–16. These numbers are estimated from forum benchmarks on other GPUs, so a small bench should confirm them.
- **Stay on WebGLRenderer.** WebGPU's `DynamicLighting` / `ClusteredLighting` only pays off above about 16 dynamic lights. Revisit for the Arena.
- Side finding: in r187 `PCFSoftShadowMap` is deprecated, not removed. It is still exported, and the renderer warns and falls back to `PCFShadowMap`.

# Vines: spans and curtains

Status: draft for approval (2026-11-15)
Replaces: the `vine` prop from [ticket 18](../../../.scratch/m1-slice/issues/18-moss-and-vines.md)
Reference: the human's lianas sheet (braided brown trunks, looping green tendrils, leaf clusters, moss drips). Not committed. The **Look** section below describes it.

## Intent

Make the temple feel overgrown. Ticket 18's straight strands read as green tufts near the cap and don't sell it. The human wants thick vines that **hang down the walls** and **cross the corridors overhead**, like jungle lianas.

## Goals

- **Spans**: braided lianas sagging from wall cap to wall cap across corridors.
- **Curtains**: tendrils and leaves hanging down south-facing wall faces.
- **Overgrown density**: about 15–25 spans per level, with curtains common on south faces.
- **Slow sway** on tendrils and curtain tips.
- **Pip is never hidden**: a span fades out when Pip is near it.

## Non-goals

- Vines in rooms, or on faces other than the south ones the camera sees.
- Vines that react to Pip (brushing aside), or swaying thick lianas.
- Unique geometry per span (variants plus mirroring and jitter are enough).
- Audio, or any gameplay effect.

## Anti-goals (a failure even if it works)

- A span over a hazard or pickup tile, or one that hides Pip or a hazard telegraph.
- Any shader compiling mid-play, or a light added, removed or toggled (`rig-guard` must stay clean).
- Touching the generator stream or v2's decor draws: `generator-baseline` and `decor-baseline` stay green.
- Colour literals outside `palette.json`.

## Decisions (the human's)

- **Placement**: spans cross corridors from cap to cap, plus curtains hang down walls.
- **Exclusions**: never over a hazard or pickup tile.
- **Occlusion**: spans fade when Pip is near (option B). Spans may cross the critical path and the spawn zone; the fade handles those.
- **Density**: "Overgrown", about 15–25 spans per level. Counts are tunable.
- **Motion**: slow sway on tendrils and curtain tips, off under reduced motion.
- **Build approach**: A, variants built in Blender and instanced (see Approaches).

## Approaches

The key fact for all three: every corridor is exactly one tile (`TILE_SIZE` = 2 m) wide between 2.2 m walls, so every span bridges the same gap.

- **A. Blender variants, instanced (chosen).** A bpy builder grows 3–4 span variants and 3–4 curtain variants. The view instances them, rotated, mirrored and jittered. A small shader patch adds sway and a per-instance fade. It fits the project's existing pattern: bpy assets on palette inputs, a GLB contract test, instanced decor, and no per-level geometry. Variety is bounded by the number of variants. **Chosen** because fixed-width corridors mean fixed-size variants lose almost nothing.
- **B. three.js geometry generated at level build.** Tubes along random curves, merged per level. Every span is unique, but this breaks "models come from Blender", allocates geometry every level (risking the spec's memory baseline), and puts art in TypeScript.
- **C. A Blender kit bent in the vertex shader.** Unique sags from fixed geometry. It is the most shader work and the fiddliest to tune, and uniform corridors remove most of its benefit.

## Design

### Plan (`src/core/decor.ts`)

- **`planSpans(level, seed, chance, avoid)`**:
  - A span goes on a **plain floor tile** (map value 0) with **walls on two opposite sides**:
    - north and south walls (an east–west corridor) → a span running north–south;
    - west and east walls (a north–south corridor) → a span running east–west.
  - Never on a hazard tile (every trap tile, including blades), a mummy patrol, a key, a coin or the chest.
  - The span exclusion set is **narrower than `decorAvoid`**: the critical path and the spawn zone are allowed.
  - Two spans are never on adjacent tiles.
  - Its RNG is its own per-tile stream: `tileRng(seed, col + 2500, row + 2500)`.
  - Each placement records its axis, a variant index, a mirror flag and a jitter draw.
- **`planCurtains(level, seed, chance, avoid, spans)`** replaces `planVines`:
  - It reuses `planVines` tile rule, a plain floor tile with a wall to the north, and its stream (`col + 1500`).
  - A **north–south span always drops a curtain** on its north wall's south face.
  - Standalone curtains are rolled on other wall-north tiles at `curtainChance`.
  - A curtain never hangs above a hazard or pickup tile, so blade lintels and flame grates stay clear.
  - **Exclusion set:** curtains use the same narrow set as spans (hazards, patrols and pickups), not `decorAvoid` (my call). Curtains sit behind Pip, so they never hide him, and the main route should look as overgrown as the rest. A span's curtain is therefore an ordinary curtain, never an override. `curtainChance` sets the density.
- `planProps` computes the narrow set once and returns decor, spans and curtains.
- **The `vine` kind is retired** (my call): `decor_vine` is removed from `build_decor.py` and `decor.glb` is rebuilt once. Along with it go `vine` in `PROP_KINDS`/`DECOR_NODE`, the vine constants in `src/render/decor.ts`, and the vine cases in `decor-glb.test.ts`, `decor.test.ts` and `decor.spec.ts`. That keeps dead geometry out of the asset.
- **Defaults**: `spanChance` and `curtainChance` default to values that give 15–25 spans per level on seeds 42, 1, 7, 123 and 999 for levels 0 and 1 (a unit test pins this). Both are read at build, like `vineChance` today.

### Look

- **Spans**:
  - 2–3 brown lianas braided around each other, swept along a sag curve. The sag depth varies by variant, 0.3–0.6 m below the cap.
  - Green tendrils loop below the lianas in U-shapes.
  - Broad leaf clusters bunch at 2–3 points.
  - Moss drips hang off the thick vines.
  - Ends overlap onto both caps by about 0.3 m and splay into a root-like anchor, so they look grown in rather than glued on.
  - Nothing goes below **1.6 m** (the hero is 1.5 m tall).
- **Curtains**: a fringe of tendrils and leaves hanging from the cap edge down the south face, with ragged lengths of 0.8–1.8 m. Like ticket 18's vine, they sit clear of the cap lip (`LIP_REACH`).
- **Colours**:
  - New palette keys `BARK_DARK` and `BARK` (not in v2) for the lianas. They must read as wood, distinct from the stone browns and the hero-reserved browns, and get a `$comment` note in `palette.json`.
  - Leaves use `MOSS_LIGHT` and `MOSS`; drips use `MOSS` and `MOSS_DARK`.
  - Everything is flat Principled materials, no textures, as the decor kit is.

### Asset (`blender/scripts/build_vines.py` → `public/models/vines.glb`)

- **Builder**: a new builder, registered by name with `pnpm assets:build`. It is kept separate from `decor.glb` so vine iteration never churns the other props.
- **Nodes**: `vine_span_0..N` and `vine_curtain_0..N`, with 3–4 of each.
- **Frames**:
  - Span origin: the corridor centre at cap height (y = `WALL_HEIGHT`), running along local x, with the gap from x = −1 to +1.
  - Curtain origin: the wall foot of a south face, like moss, hanging in −y from the cap.
- **Determinism**: geometry is deterministic and sorted before export (the `build_decor.py` lesson), so rebuilds are byte-identical.
- **Sway weight**:
  - Each vertex carries a sway weight: 0 on the lianas and anchors, rising to 1 at tendril tips and curtain ends.
  - It travels as a glTF vertex attribute or a vertex-colour channel; the builder chooses which.
  - If it needs a change to `lib/gltf.export_glb`, run `pnpm assets:test`.

### View (`src/render/decor.ts`, or a new `vines.ts` beside it)

- **Instancing**:
  - One InstancedMesh per variant, allocated for a whole map, over the GLB's shared materials, so a level rebuild changes only counts and matrices.
  - Rotation by axis, mirror via negative x scale, and a small uniform scale jitter.
- **Shader patch**: an `onBeforeCompile` patch on the vine materials, in the manner of `addRim` in `hero.ts`, with a fixed `customProgramCacheKey`. It does two things:
  - **Sway**: vertex offset = `swayAmp × weight × sin(2π·swayHz·t + phase)`. `t` is sim time; `phase` is hashed from the instance's world position and the vertex's position.
  - **Fade**: a per-instance `instanceFade` attribute (0–1) drives a dithered `discard` in screen space, so the material stays opaque. No transparency toggling, no sorting, no recompiles.
- **Fade rule**:
  - It runs in `render` from Pip's interpolated position. A span's target fade is 0 when Pip is within `spanFadeRadius` of its centre, else 1. It eases over `spanFadeMs`.
  - Curtains don't fade: they sit behind Pip from this camera.
- **Shadows**: spans don't cast shadows, so a faded span leaves no ghost shadow. Curtains don't either, as ticket 18's vines didn't.
- **Precompile**: the vine materials are in the scene before `compileAsync` (the director's existing precompile), so the post-boot program count stays at its baseline.
- **Reduced motion**: `swayAmp` drops to 0. The fade still runs (it is visibility, not motion).
- **Observables**: something like `__game.vines.motion()` → `{ swayAmp }` and per-span fade values, for e2e.

### Feel values (`look.decor`)

`spanChance`, `curtainChance`, `spanFadeRadius` (m), `spanFadeMs`, `swayAmp` (m), `swayHz`, `curtainLength` and `curtainJitter` (replacing `vineLength`/`vineJitter`), and `spanScaleJitter`. Everything except the two chances is read every frame, so panel edits are live.

## Acceptance

- Unit tests:
  - Same seed, same spans and curtains.
  - Spans only on two-sided corridor tiles, never on an excluded tile, never adjacent.
  - Every north–south span has its curtain.
  - 15–25 spans per level on the five seeds for levels 0–1.
  - `generator-baseline` and `decor-baseline` pass.
- The GLB contract test covers:
  - the node names;
  - the span frames, nothing below 1.6 m except the anchors on the caps, and the anchors within the cap overlap;
  - the curtain frame and its cap-lip clearance;
  - palette colours and no lights;
  - the sway weights being present.
- View tests: matrices for both axes and the mirror; a span's fade reaches 0 with Pip under it and returns to 1 after; sway is 0 under reduced motion.
- e2e on seed 42, levels 0 and 1:
  - spans and curtains are present;
  - each kind changes at least 150 px when hidden (ticket 18's visibility check);
  - with Pip walking under a span, its fade reaches 0 and Pip's pixels are visible;
  - `rig-guard` records no violations, and the program count is unchanged across the level change;
  - sway is 0 with `prefers-reduced-motion` emulated.
- `pnpm check` and `pnpm test:e2e` pass. Game-camera screenshots go in `docs/art/m1/`.

## Checked by the builder review

- **Density**: about 170–185 eligible corridor tiles per test level, 130–150 once no two spans are adjacent. A `spanChance` of about 0.12 lands in the 15–25 range.
- **Blades**: no clash. A blade swings north–south in a thin plane through its wall slots, so a span on a neighbouring tile is clear.
- **Dead ends**: a dead end has three walls, so only one axis has opposite walls and the normal rule covers it. There is no special case.

## Left to the builder

- Exact variant shapes.
- Braid counts.
- The leaf mesh design.
- The sway-weight transport.
- The fade's dither pattern and easing.
- The `BARK` hex values: checked by eye and by the pixel test for reading as wood.
- The default chances that hit the 15–25 target.
- Whether the view lives in `decor.ts` or `vines.ts`.

## Revisions after plan validation (2026-11-15, the human's choices)

- **Density** is measured as a mean of 15–25 spans across the test levels (seeds 42, 1, 7, 123, 999; levels 0–1), with each level between 12 and 28. One chance value can't hold every level inside 15–25.
- **Respawn**: any hero jump of more than one tile (a respawn or a level start) snaps nearby spans straight to faded. Spans may still cover the start zone.
- **Sway**: everything sways, bark included. The weight is the depth below the cap, so anchors stay put. This replaces "lianas stay still" and the baked per-vertex sway weight.
- **Greens**: leaves use `MOSS_LIGHT`, and drips and inner tendrils use `MOSS`.
- **Bark**: one `BARK` key, a weathered grey-brown (`#6f6555`) kept more than 30 sRGB units from every stone, sand and hero brown. `BARK_DARK` is dropped.
- **Curtain frame**: origin at the top of the south face's edge (ticket 18's vine frame), hanging down.
- **Performance**: frame time is recorded before and after, a soft gate, as in the M1 spec.

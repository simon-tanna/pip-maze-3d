# Which hero ships in the slice: a placeholder or a rigged character?

Type: grilling
Status: resolved
Blocked by: 02, 04

## Question

Does the slice use a stylised placeholder (e.g. a primitive-built Pip with squash on step, the way v2 does it procedurally) or a first rigged Blender character with idle and walk? Which character (Pip / John / Ellen) comes first? Which of v2's `hero.js` behaviours (contact shadow, step squash, dust, idle breathing, hit flash, invulnerability flicker) are in the slice?

## Answer

**Pip, hand-authored by the human as a rigged `.blend`.** Concept: [`docs/art/pip-concept.png`](../../../docs/art/pip-concept.png). It shows a tall olive hat, a navy knee-length coat with a brown pocket patch, black gloves, brown boots, a heavy moustache and the red scar. John and Ellen wait for character select (out of scope). Ellen's teal shirt and John's gold bullet belt would also clash with the reserved curse and gold hues.

### Character contract (acceptance criteria for the HITL authoring issue)

- Faces Blender −Y (→ three +Z, south, toward the camera), origin between the feet at Z=0, about **1.5 m** tall, footprint inside **1.2 m**. Big head; the hat crown and brim are the main silhouette from the 65° camera.
- One armature, 12–16 bones, `snake_case` with `_L`/`_R` (no dots), per [ticket 04](04-character-pipeline.md).
- Actions **`idle`** and **`walk`** only, each with a fake user. `walk` is one full cycle (two footfalls), played back at 0.24 s. **The clips own the feel:** bob and squash live in `walk`, breathing lives in `idle`. Code adds no procedural squash on steps.
- **Material slots are named after `HERO_*` palette keys.** At export, `lib/palette.py` overwrites each slot's Base Color from `palette.json`. Greyscale detail (folds, stitching, scar) may go in roughness and normal, but no painted colour.
- The skinned `export_glb` profile enforces all of this and fails the export on violations.
- Proportions, which face details survive at about 90 px on screen, and silhouette tweaks are the human's calls while modelling. They don't change the contract.

### Palette

Add a `HERO` block to `palette.json`, reserved for the hero the way gold is reserved for pickups: `HERO_HAT`, `HERO_COAT`, `HERO_COAT_DARK`, `HERO_SKIN`, `HERO_LEATHER`, plus `HERO_GLOVE` (dark, but not `INK`, so it doesn't merge with the contact shadow) and optionally `HERO_SCAR`. Starting values are sampled from the concept. `HERO_HAT` must read as a different hue from `MOSS`, because the crown is what the camera mostly sees.

### Stand-in

An agent-built bpy **stand-in** (box body, cylinder hat) meets the contract exactly and exports to the same GLB path, so hero-dependent work isn't blocked on the art. The human's `.blend` overwrites that path with no TS changes, and the stand-in script is then deleted. Until then, the stand-in is the fixture for the Vitest GLB check from ticket 04.

### Behaviours in the slice

| v2 `hero.js`                 | Slice           | 3D form                                                                                         |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| Ink outline                  | No              | Replaced by the `CREAM` fresnel rim (ticket 02)                                                 |
| Contact shadow               | Yes             | Soft `INK` blob decal under the feet, plus the real key-light shadow                            |
| Idle breathing / step squash | Yes, in clips   | Part of `idle` / `walk`; no code tweens                                                         |
| Hit flash                    | Yes             | 80 ms `CREAM` emissive pulse                                                                    |
| Death pop / respawn pop      | Yes, on the rig | Procedural root knockback then scale to 0; Back-ease scale back up. No `die` clip               |
| Grace flicker                | Yes             | Mesh visibility toggled every 80 ms; under reduced motion, a steady boosted `CREAM` rim instead |
| Dust on land, death puff     | No              | Particles belong to the "Death, respawn and FX feel" area of the map                            |

### Other calls

- **No torch prop.** The torch PointLight stays as unexplained fill south of the hero. A held flame would sit apart from its own light and close to a flame telegraph in screen space. Ticket 02's carried-flame exception goes unused for now.
- **Grace is simulation state.** v2 keeps `rig.invulnerable` on the presentation rig. Here, the 1 s timer lives in `src/game`, is ticked in `update(dt)` and is read by the hazard kill checks, and the hero view only displays it. Added **Grace** to `GLOSSARY.md`.
- **Scope split:** this ticket owns what the hero rig does. Camera shake, hit-stop, iris and particles stay in the FX fog.

## Comments

**Amendment (2026-11-07, human call during [Write the milestone-1 slice spec](08-slice-spec.md)):** agents build Pip, not the human. `blender/scripts/build_pip.py` builds Pip in bpy from `docs/art/pip-concept.png` to the same character contract, with face details (eyes, brows, moustache, scar) as small geometry in their own `HERO_*` slots. It ships in two passes: a contract-correct blockout that replaces the "stand-in" above, then a fidelity pass checked against rendered turnarounds and game-camera shots, which the human reviews and signs off. A hand-authored `.blend` can still replace the GLB at the same path later. Everything else in this answer stands.

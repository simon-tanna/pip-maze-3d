# How is a map built into a chamber?

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

How does `src/render/chamber.ts` turn a map into 3D? Options: v2's 4-bit autotile mask choosing wall-kit variants rendered as one InstancedMesh per variant, merged static geometry, or a generic extruded block with trim. What wall height lets the camera from 01 see the hero and telegraphs, and do walls between the camera and hero fade, cut away or shorten? Which Blender kit pieces does the slice need (wall variants, floor flagstone, start marker, chest plinth)? How does decor (`planDecor`) carry over, if at all, in the slice?

## Answer

**Face kit, planned in core and instanced in render.**

### Plan, then instantiate

- `planChamber(map, seed)` in `src/core` is pure (no three.js) and returns placements as data: `{ piece, variant, col, row, rotation }`. Unit-test it in Node: the same seed gives the same plan, and the mask gives the faces.
- Every **wall tile** gets one **cap**. It gets one **face** for each open neighbour (v2's 4-bit mask from `wallMask`: `OPEN_N/E/S/W`), rotated to look at that neighbour. Faces toward other walls are never placed.
- Every **floor tile** (values 0, 2 and 3) gets one **flagstone**.
- Variants come from `tileRng(seed, c, r)` as in v2's `drawChamber`: 3 cap variants, 3 face variants, and 5 flagstone variants weighted 40/20/15/15/10 (`v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.75 ? 2 : v < 0.9 ? 3 : 4`).
- `src/render/chamber.ts` only turns the plan into matrices, one `InstancedMesh` per (piece, variant), so tearing a chamber down means setting counts.

### Dimensions

- **Wall height 2.2 m** (the height camera and input validated). No wall fade, cutaway or shortening. Change `WALL_HEIGHT` in `blender/scripts/build_placeholders.py` from 3.0 to 2.2.
- **Face relief stays inside the wall tile's boundary**, so floor tiles stay fully clear. The face piece carries a **cap lip** of at most 5 cm over the floor, with 45° mitred ends, so outer corners close. There are **no corner pieces** in the slice.

### Padding beyond the map

`planChamber` adds a **render-only ring of caps** outside the map: **9 tiles east and west, 5 north, 4 south**, as named constants. These margins come from the camera frustum at cap height (±9.4 tiles sideways at the top of the frame, 5.3 north, 4.0 south of the look-at point). The camera does **not** clamp to the map bounds, which would lose the 1 m lead near edges. Padding isn't part of the map, so `isFair`, pathfinding and the seed never see it. Padding caps don't cast shadows. The background stays `INK`.

### Contact AO

Baked AO only covers the inside of each piece. The darkening where floor meets wall comes from an instanced **contact strip**: a multiply-blended gradient quad that `planChamber` places along every wall–floor edge, wider on the north and west sides like v2's `paintAO`. Its strength lives in `look.ts`.

### Kit

- Slice kit: **cap × 3, face × 3, flagstone × 5 (v2's five layouts), contact strip**.
- Agents build it with **bpy-procedural** code (art direction: palette-input Principled BSDF, AO baked, 128 px/m) into **one `public/models/kit/chamber.glb`** with named nodes (`cap_0`…`cap_2`, `face_0`…`face_2`, `floor_0`…`floor_4`, `contact`). The pieces share one baked texture atlas, so the chamber uses one material plus the strip's.
- A hand-made `.blend` can replace any node later under the same name, with no code change.
- No start marker and no chest plinth (v2 draws neither). The chest, key and coin are **pickups**, outside this ticket (now fog on the map).

### Shadows

The single shadowed key light's shadow camera is **fixed to the map's 80 × 30 m extent** (not the padding) at 2048² (≈ 4 cm per texel), set once per chamber. The map size and shadow-map size go in `look.ts`, so 4096² is a one-line upgrade if shadows look soft.

### Decor

Port v2's `planDecor` (environment.js) to `src/core` test-first. Its `avoid` set covers hazards, pickups and the critical path. Render the four kinds (bones, rubble, pot, moss) as small bpy-procedural props, with moss growing on the south face of the wall to the north. This is the **last, cuttable** slice issue. `Decor` is now in `GLOSSARY.md`.

### Notes for other tickets

- **How do flame and blade read, and how do they telegraph, in 3D?**: any wall mount for the blade pivot is a hazard piece, not a chamber kit piece. Nozzles sit on floor tiles, as in v2.
- **Slice spec**: the build order is roughly `planChamber` (core, tested) → placeholder kit → `chamber.ts` → procedural kit → decor (cuttable).

**Rejected:** merged static geometry (rebuilding and disposing per level, re-merging to swap a piece); an instanced extruded block per tile (draws hidden faces, can't vary AO or wear by context); fading or cutting away walls; an `INK` void or a flat plane beyond the map; clamping the camera to the map; floor variants pre-baked per mask (80 textures); a shadow frustum that follows the camera; a start marker or chest plinth.

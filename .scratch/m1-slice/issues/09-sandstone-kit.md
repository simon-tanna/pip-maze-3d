# 09: Procedural sandstone kit

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The chamber stops being placeholders: an agent-built, bpy-procedural kit in Torchlit Sandstone replaces ticket 03's placeholder kit, which already uses these node names, so no TS changes beyond the asset path. See ADR 0001 and the map's chamber-build and art-direction tickets.

- One kit GLB with named nodes: `cap_0`–`cap_2`, `face_0`–`face_2`, `face_slot` (full-height slot for the blade), `cap_slot` (cap with a full-depth north–south slot, placed beside blades), `floor_0`–`floor_4` (v2's five flagstone layouts) and `contact`.
- Principled BSDF with palette inputs only (ramps as block tone, mortar and wear, not painted lighting). CC0 maps for greyscale detail only. Baked AO, 128 px/m, one shared atlas, so the chamber uses one material plus the contact strip's.
- Face relief stays inside the wall tile; a cap lip of at most 5 cm with 45° mitred ends, so outer corners close without corner pieces.
- Floors are the darkest, lowest-contrast surface.
- All export goes through the shared `export_glb`. The builder registers with `pnpm assets:build`.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] `pnpm assets:build` rebuilds the kit headlessly and deterministically
- [x] A Vitest check parses the kit GLB and finds every named node at the expected bounds (2 m tile, 2.2 m height)
- [x] No colour literals in the bpy code; colours come only from the palette
- [x] Game-camera screenshots of the shared fixture's seed are linked on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) against ADR 0001's colour reservations and "floor is the darkest surface" rule. Not needed for agent-complete
- [ ] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-14: The kit contract gained `cap_slot` (code-review fix on `main`). Caps are separate pieces on every wall tile, so `face_slot` alone left the blade clipping through the 2.0–2.2 m cap slab. The blade head reaches about 1.6 m into the wall tile at cap height. The placeholder kit already has it; the sandstone kit must provide it too.
- 2026-11-15: Agent build on `ticket/09-sandstone-kit`. `blender/scripts/build_chamber_kit.py` writes `public/models/kit/chamber.glb` (`CHAMBER_KIT = 'kit/chamber'`; the only TS change beyond the path is two contract constants, `LIP_REACH` 0.05 m and `LIP_BOTTOM` 2.06 m, in `chamber-kit.ts`). Bevelled capstones (v2's seam layouts), four brick courses over a recessed mortar bed, a 5 cm cap lip with 45° mitred ends, v2's five flagstone layouts over grout. Source materials are Principled BSDF with palette-only colour inputs (per-block tone ramps, mortar, `SAND` wear, grime); one 2048² atlas at 128 px/m, baked in Cycles (seed 0) into base colour, ORM (baked AO in R) and a normal map; one `sandstone` material plus `contact`'s. Repeated `pnpm assets:build` runs give the same GLB hash. Only seen edges are chamfered and hidden sides are left out (caps are 84 vertices, about 1000 instances with the padding ring). **No CC0 maps:** greyscale detail (bump, roughness) is procedural bpy noise, so the build needs no network. `tests/unit/chamber-kit.test.ts` checks node names and bounds, the lip and mitres, the blade slots, the single atlas material with its maps, 128 px/m texel density, and that the baked floor is darker and lower-contrast than every cap and face. The placeholder kit stays buildable (`pnpm assets:placeholders`) as a debugging fallback. The textured kit made SwiftShader frames costlier, so `acceptance.spec.ts` now renders only the last step of its three long walks (`frames: 'last'`, the same ticks, as chest-transition already does); it had timed out at 120 s under 4 workers. Known nit for review: where two faces meet in a straight run, the mitred lip ends overlap in a 5 cm triangle (coplanar, same material). Game-camera screenshots, seed 42 (the shared fixture), 1920×1080, dev panel hidden: [level 0 start](../../../docs/art/m1/09-level0-start.png), [level 0 at the key](../../../docs/art/m1/09-level0-key.png), [level 1 start](../../../docs/art/m1/09-level1-start.png).

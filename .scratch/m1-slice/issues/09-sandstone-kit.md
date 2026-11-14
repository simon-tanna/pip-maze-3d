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

- [ ] `pnpm assets:build` rebuilds the kit headlessly and deterministically
- [ ] A Vitest check parses the kit GLB and finds every named node at the expected bounds (2 m tile, 2.2 m height)
- [ ] No colour literals in the bpy code; colours come only from the palette
- [ ] Game-camera screenshots of the shared fixture's seed are linked on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) against ADR 0001's colour reservations and "floor is the darkest surface" rule. Not needed for agent-complete
- [ ] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-14: The kit contract gained `cap_slot` (code-review fix on `main`). Caps are separate pieces on every wall tile, so `face_slot` alone left the blade clipping through the 2.0–2.2 m cap slab. The blade head reaches about 1.6 m into the wall tile at cap height. The placeholder kit already has it; the sandstone kit must provide it too.

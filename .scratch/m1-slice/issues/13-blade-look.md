# 13: Steel blade and lintels

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Blades get their real look: a steel axe head and haft spinning through slotted walls under twin stone lintels. See the map's hazards ticket and ADR 0002.

- A bpy helper extrudes the blade head from the **same outline JSON** core uses. Steel head and haft (`STEEL_LIGHT` base, `STEEL` / `STEEL_DARK` wear, metal 1, roughness 0.3–0.45), crescent edge down. The builder registers with `pnpm assets:build`.
- Two `STONE_DARK` lintels on the wall tops, one each side of the swing plane, with a steel axle between them; the head clears them over the top.
- The view's spin angle comes from the core phase, so the head is where the contact test says it is.
- No trail, no edge glow, no floor decal.

**Blocked by:** 08, 09

**Status:** ready-for-human

- [x] A Vitest check compares the blade GLB's head bounds with the outline JSON
- [x] With the contact-zone overlay on, the drawn head and the contact zone coincide within 0.05 m at phases 0°, +28°, −28°, 90° and 180°
- [x] Game-camera screenshots are linked on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) against ADR 0001's steel reservation and ADR 0002. Not needed for agent-complete
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- 2026-11-15: Agent build on `ticket/13-blade-look`. `blender/scripts/build_blade.py` writes `public/models/hazards/blade.glb` (`BLADE_MODEL = 'hazards/blade'`; contract in `src/render/blade-kit.ts`): nodes `head`, `haft`, `axle`, `lintel_0`, `lintel_1`, each modelled in place in its own frame. `blender/scripts/lib/blade.py` reads `src/core/blade-shape.json` and samples the crescent exactly as `HEAD_RING` does; the head is that ring extruded ±halfThickness with its cutting edge chamfered (3.5 cm a side), so the silhouette is the outline. Octagonal haft from an axle hub down into the head; two bevelled `STONE_DARK` lintels on the wall tops (2.2–2.56 m, 3.2 m long, from 0.19 m off the plane, just over the slot's edge) with the steel axle between them at 2.45 m. Source materials are Principled BSDF with palette-only inputs (steel: `STEEL_LIGHT` base, `STEEL` scratches, `STEEL_DARK` grime, roughness 0.3–0.45; stone: `STONE_DARK` mottled toward `SHADOW`), baked in Cycles (seed 0) into base colour, ORM (baked AO, roughness, metal 1 / 0) and a normal map per material, 512² each at 128 px/m. The new shared `blender/scripts/lib/bake.py` holds the bake helpers (`build_chamber_kit.py` keeps its own copy, untouched). The blade's materials fill exactly the chamber atlas's texture slots, so they share its shader program: a blade-free level 0 can't make level 1 compile mid-play. Repeated builds give the same GLB hash. `BladesView` now takes the GLB (`createBladesView(kit, scene.environment)`; `gltfKit` in `@assets/models` is `loadGltf` without the fetch). The steel takes the palette environment as its own `envMap` at `look.blade.steelEnvIntensity` (1), because three ignores a material's `envMapIntensity` under `scene.environment`, and at the chamber's 0.25 the metal read almost black. `look.blade` is now `steelRoughness` / `stoneRoughness` (scales on the baked roughness) and `steelEnvIntensity`. No trail, edge glow or decal. Tests: `tests/unit/blade-glb.test.ts` (head bounds and every outline point against the JSON, haft, lintels either side of the plane with the spinning parts between them, materials, shared texture slots); `tests/unit/blades-view.test.ts` (with the overlay on, the drawn head and the zone coincide within 0.05 m at 0°, ±28°, 90°, 180°); `tests/e2e/blade-look.spec.ts` (the same check in the running game on `blade@24,1`, with no program compiled after boot). Known for review: from the fixed north camera the swing plane is edge-on, so the head reads as a thin steel line most of the turn (map ticket 07's accepted risk). Game-camera screenshots, seed 42 (the shared fixture), level 0, hero just west of `blade@24,1`, 1920×1080, dev panel hidden: [head down, 0°](../../../docs/art/m1/13-blade-down.png), [swinging, 50°](../../../docs/art/m1/13-blade-swing.png), [across, 90°](../../../docs/art/m1/13-blade-across.png), [up, 180°](../../../docs/art/m1/13-blade-up.png), [contact-zone overlay on, 28°](../../../docs/art/m1/13-blade-zone-28.png).

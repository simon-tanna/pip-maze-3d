# 03: See level 0's chamber

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Opening the dev server shows level 0 built as a chamber from a real generated map, on the placeholder kit, seen from the slice camera. See the spec's _Render → Chamber_, the map's chamber-build ticket and its camera ticket.

- A pure, tested `planChamber(map, seed)` in core returns placements: a cap per wall tile; a face for each open neighbour (v2's 4-bit mask); a flagstone per floor tile; seeded variants (3 cap, 3 face, 5 flagstone at 40/20/15/15/10); a render-only padding ring of caps (9 E/W, 5 N, 4 S); contact strips along every wall–floor edge, wider on the north and west sides.
- Render instances the plan, one `InstancedMesh` per (piece, variant), on placeholder pieces at **2.2 m** wall height (update the placeholder builder from 3.0).
- The key light's shadow camera fits the map (not the padding) at 2048²; padding doesn't cast shadows.
- The fixed-yaw north camera from the camera ticket (7 m back, 15.7 m up, fov 57), looking at the start tile for now.
- **Seeds:** `?seed=<uint32>&level=<i>` pins the level. Without them, a base seed is drawn with `crypto.getRandomValues` at boot and logged. Level seeds derive from the base seed and stay fixed for the run. `Math.random` is never used for anything level-visible.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] `planChamber` unit tests: the same seed gives the same plan; faces only towards open neighbours; padding never overlaps the map; variant weights match
- [ ] Loading `?seed=…&level=0` twice renders an identical chamber; without params, the console logs the base seed
- [ ] Walls are 2.2 m and the background is `INK`
- [ ] e2e smoke still reaches `data-ready`
- [ ] `pnpm check` passes

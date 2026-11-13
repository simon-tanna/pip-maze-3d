# 03: See level 0's chamber

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Opening the dev server shows level 0 built as a chamber from a real generated map, on the placeholder kit, seen from the slice camera. See the spec's _Render → Chamber_, the map's chamber-build ticket and its camera ticket.

- A pure, tested `planChamber(level, seed)` in core, where `level` is the generator's output (map **and** hazards, so ticket 08 can add the slotted face without changing the signature). It returns placements: a cap per wall tile; a face for each open neighbour (v2's 4-bit mask); a flagstone per floor tile; seeded variants (3 cap, 3 face, 5 flagstone at 40/20/15/15/10); a render-only padding ring of caps (9 E/W, 5 N, 4 S); contact strips along every wall–floor edge, wider on the north and west sides. It also exports `PLAN_CAPACITY`, the worst-case instance count per piece for a 40×15 map.
- **Placeholder kit:** one `placeholders/chamber.glb` with exactly ticket 09's node names (`cap_0`–`cap_2`, `face_0`–`face_2`, `face_slot`, `floor_0`–`floor_4`, `contact`; variants may be duplicate meshes), at **2.2 m** wall height (update the placeholder builder from 3.0). Ticket 09 then swaps the file, not the code.
- **Asset API:** add `loadGltf(name)` to `src/assets`: a cached parse with `getNode(name)` returning a node's geometry and material for instancing. `loadModel` stops forcing `castShadow` / `receiveShadow`; each view sets its own.
- Render instances the plan: one `InstancedMesh` per (piece, variant), allocated at `PLAN_CAPACITY`, with `computeBoundingSphere()` after every build.
- The key light's shadow camera fits the map (not the padding) at 2048²; padding doesn't cast shadows.
- The fixed-yaw north camera from the camera ticket (7 m back, 15.7 m up, fov 57), looking at the start tile for now.
- **Seeds:** as the spec's _Scope and run → Seeds_. `?seed=S&level=i` generates level i with S as its seed; later levels use `levelSeed(S, j)`. Without params, a base seed is drawn with `crypto.getRandomValues` at boot and logged. Invalid `seed` or `level` logs a warning and falls back. `Math.random` is never used for anything level-visible.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] `planChamber` unit tests: the same seed gives the same plan; faces only towards open neighbours; padding never overlaps the map; variant weights match; no piece's count exceeds `PLAN_CAPACITY` over the baseline seeds
- [ ] Loading `?seed=…&level=0` twice renders an identical chamber; without params, the console logs the base seed
- [ ] `?seed=S&level=0` builds the same map as v2's `generateLevel(0, S)`
- [ ] `?level=5` and `?seed=abc` each log a warning and fall back to an unpinned level 0
- [ ] Walls are 2.2 m and the background is `INK`
- [ ] e2e smoke still reaches `data-ready`
- [ ] `pnpm check` passes

# 13: Steel blade and lintels

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Blades get their real look: a steel axe head and haft spinning through slotted walls under twin stone lintels. See the map's hazards ticket and ADR 0002.

- A bpy helper extrudes the blade head from the **same outline JSON** core uses. Steel head and haft (`STEEL_LIGHT` base, `STEEL` / `STEEL_DARK` wear, metal 1, roughness 0.3–0.45), crescent edge down.
- Two `STONE_DARK` lintels on the wall tops, one each side of the swing plane, with a steel axle between them; the head clears them over the top.
- The view's spin angle comes from the core phase, so the head is where the contact test says it is.
- No trail, no edge glow, no floor decal.

**Blocked by:** 08, 09

**Status:** ready-for-agent

- [ ] A Vitest check compares the blade GLB's head bounds with the outline JSON
- [ ] With the ground-truth overlay on, the drawn head and the contact zone coincide at several sampled phases
- [ ] Human sign-off from the game camera
- [ ] `pnpm check` and `pnpm test:e2e` pass

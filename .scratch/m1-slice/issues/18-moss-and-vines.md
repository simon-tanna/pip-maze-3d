# 18: Moss and vines you can see (subtask of 16)

Spec: [Milestone 1, the vertical slice](../spec.md)
Parent: [16: Decor](16-decor.md)

**What to build:** Moss and vines visibly dress the chamber walls. This is a requirement: ticket 16 shipped moss that the human can't see in play, and dropped vines because v2's `DECOR_KINDS` has none.

- **Moss is missing in play.** `planDecor` places it: seeds 42, 1, 7, 123 and 999 give 2–6 moss per level for levels 0 and 1. So the loss is in the asset or the view (`blender/scripts/build_decor.py`, `src/render/decor.ts`): the patch's orientation after the Z-up → Y-up export, its depth relative to the kit's south face (`chamber-kit.ts`: the face sits inside the wall tile; only the cap lip passes the edge), its scale, or its contrast against sandstone from the chase camera. Find the cause first (use the `diagnosing-bugs` skill). Then fix it so moss reads clearly on the south face of the wall to the north, the face the north-chase camera sees.
- **Vines are new (not a v2 port).** Hanging vines on south-facing wall faces, growing down from the cap. They are bpy-procedural props in `decor.glb`, using only palette colours (`MOSS` / `MOSS_DARK`, or a new palette key if none fits; ADR 0001's reservations still apply). They are instanced from the plan like the other kinds.
- **v2 parity stays.** v2's tiles and kinds for bones, rubble, moss and pot still match `tests/fixtures/decor-baseline.json`. Vines must not change v2's first two draws per tile. Plan them from later draws of the same per-tile `tileRng` stream, or from a stream of their own, so they can share a tile with moss, or have tiles to themselves on any wall-north floor tile. Keep the 16 rules: never on a hazard, pickup, the critical path or the spawn zone, and the generator stream is untouched.
- Placement numbers (vine length and density, moss scale and offset) go in `look.decor`.

**Blocked by:** 16

**Status:** ready-for-agent

- [ ] The moss root cause is recorded in a `## Comments` line, and a unit or e2e check would have caught it (e.g. the moss instance's world bounds sit in front of the face and inside the camera frustum)
- [ ] Unit tests: same seed, same vines; vines only on tiles with a wall to the north and never on an avoided tile; the decor baseline still passes
- [ ] The decor GLB contract test covers the vine node
- [ ] e2e: on seed 42, moss and vine instances are present on levels 0 and 1, and rig-guard records no violations. Game-camera screenshots of both are linked in the comment
- [ ] `pnpm check` and `pnpm test:e2e` pass

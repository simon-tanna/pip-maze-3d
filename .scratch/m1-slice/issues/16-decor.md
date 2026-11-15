# 16: Decor (cuttable)

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Purely visual decor (bones, rubble, pots, moss, vines) dresses the chamber the way v2 dresses it. This is the last ticket and can be cut without affecting the slice.

- Port v2's `planDecor` to core **test-first**: sparse, wall-hugging, seeded, never on a hazard, pickup or the critical path, never affecting play.
- Small bpy-procedural props for the four kinds (palette inputs), instanced from the plan. Moss grows on the south face of the wall to the north. The builder registers with `pnpm assets:build`.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Unit tests: same seed, same decor; nothing on a hazard, pickup, the critical path or the spawn zone
- [ ] The generator baseline still passes (decor never touches the generator stream)
- [ ] `pnpm check` and `pnpm test:e2e` pass

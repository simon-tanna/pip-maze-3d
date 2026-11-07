# 08: Die on spinning blades by contact

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Blades spin a full turn every 1.6 s across their corridor and kill only when their outline touches the hero's body, including mid-step. This is the rule change in **ADR 0002**; read it and the map's blade-rule ticket first. The view is a greybox blade built from the shared outline; the steel art is ticket 13.

- One shared blade outline JSON in core (pivot height 2.45, arm 2.0, half-thickness 0.05, the crescent's quadratic control points and sample counts, as in the blade-rule ticket), read by core now and by bpy in ticket 13.
- A pure contact test: blade outline segments against one upright body capsule (r 0.4, h 1.5), the same for every character. Port source: `bladeTouches` / `segSeg` / `pointSeg` from the prototype branch `prototype/hazards-in-3d` (`9f022b3`).
- `bladeSpin = 1600` in `HAZARD_TIMING`. The phase comes from `tileRng(levelSeed, col+1000, row+1000)`. Blades sharing a wall tile (same column, two rows apart) lock to the northern blade's phase. All blades turn the same way.
- Check contact every fixed tick at the hero's `stepPosition`. No swept test (3.75° per tick against a ±28° window). Kills run ticket 07's death sequence.
- `planChamber` places the slotted face variant on the wall tiles north and south of each blade (a placeholder slotted piece until ticket 09).

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Unit tests: about 249 ms lethal per turn at the tile centre (|θ| < 28°); radius sensitivity matches the blade-rule ticket's table; a hero mid-step 0.44 m off the plane is clipped within about ±19°
- [ ] Unit tests: phase derivation and the shared-wall lock (a synthetic map is fine; the baseline has 0 cases)
- [ ] The generator baseline fixture still passes unchanged
- [ ] e2e on a pinned seed: walking through a blade at a lethal phase kills; passing under it while up does not
- [ ] `pnpm check` and `pnpm test:e2e` pass

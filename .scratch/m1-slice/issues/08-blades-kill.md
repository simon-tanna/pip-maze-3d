# 08: Die on spinning blades by contact

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Blades spin a full turn every 1.6 s across their corridor and kill only when their outline touches the hero's body, including mid-step. This is the rule change in **ADR 0002**; read it and the map's blade-rule ticket first. The view is a greybox blade built from the shared outline; the steel art is ticket 13.

- One shared blade outline JSON in core (pivot height 2.45, arm 2.0, half-thickness 0.05, the crescent's quadratic control points and sample counts, as in the blade-rule ticket), read by core now and by bpy in ticket 13.
- A pure contact test: blade outline segments against one upright body capsule (r 0.4, h 1.5), the same for every character. Port source: `bladeTouches` / `segSeg` / `pointSeg` from the tag `proto-hazards-9f022b3` (the local `prototype/hazards-in-3d` branch). Vendor them into core at the start, so the ticket doesn't depend on the branch surviving.
- `bladeSpin = 1600` in `HAZARD_TIMING`. The phase comes from `tileRng(levelSeed, col+1000, row+1000)`. Blades in a shared-wall chain (same column, two rows apart, repeated) all take the phase of the chain's northernmost blade. All blades turn the same way.
- Check contact every fixed tick at the hero's `stepPosition`. No swept test (3.75° per tick against a ±28° window). Kills run ticket 07's death sequence.
- `planChamber` places `face_slot` on the wall tiles north and south of each blade, using the hazards it already receives (ticket 03).
- Blade views register with ticket 06's per-level teardown.
- Dev-only **contact-zone overlay**: the blade's contact segments at the current phase, drawn from the same core contact test, next to ticket 07's lethal-tile overlay.
- **Acceptance journey e2e** (the spec's _Acceptance_), on the shared fixture: route to key and chest, die on a known flame and respawn with the key restored, level 1 builds, reach the end card and restart.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Unit tests: about 249 ms lethal per turn at the tile centre (|θ| < 28°); radius sensitivity matches the blade-rule ticket's table; a hero mid-step 0.44 m off the plane is clipped within about ±19°
- [ ] Unit tests: phase derivation and the shared-wall lock, including a three-blade chain (a synthetic map is fine; the baseline has 0 cases)
- [ ] Unit test: a respawn while a blade's contact zone covers the start tile doesn't kill during grace
- [ ] The generator baseline fixture still passes unchanged
- [ ] The contact-zone overlay draws the same segments the contact test uses, and is absent from `pnpm build` output
- [ ] e2e on the shared fixture: walking through a blade at a lethal phase kills; passing under it while up does not
- [ ] The acceptance journey e2e passes
- [ ] The 04–07 e2e tests stay green
- [ ] `pnpm check` and `pnpm test:e2e` pass

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

**Status:** resolved

- [x] Unit tests: about 249 ms lethal per turn at the tile centre (|θ| < 28°); radius sensitivity matches the blade-rule ticket's table; a hero mid-step 0.44 m off the plane is clipped within about ±19°
- [x] Unit tests: phase derivation and the shared-wall lock, including a three-blade chain (a synthetic map is fine; the baseline has 0 cases)
- [x] Unit test: a respawn while a blade's contact zone covers the start tile doesn't kill during grace
- [x] The generator baseline fixture still passes unchanged
- [x] The contact-zone overlay draws the same segments the contact test uses, and is absent from `pnpm build` output
- [x] e2e on the shared fixture: walking through a blade at a lethal phase kills; passing under it while up does not
- [x] The acceptance journey e2e passes
- [x] The 04–07 e2e tests stay green
- [x] `pnpm check` and `pnpm test:e2e` pass

## Comments

- Implemented on `ticket/08-blades-kill`. Core: `src/core/blade-shape.json` + `@core/blade` (`BLADE_SHAPE`, `HEAD_RING`, `BODY_CAPSULE`, `bladeSegments(θ)`, `bladeTouches(θ, u, n, capsule?)` vendored from `proto-hazards-9f022b3`, `bladeAngle(t, phase)`, `levelBlades(traps, seed)` with the shared-wall chain lock). `HAZARD_TIMING.bladeSpin = 1600`. The sim checks contact every tick at `heroPosition(0)` (after flame go-lives, before a landing) and runs 07's `kill`; `died` now carries `hazard: 'flame' | 'blade'`; `sim.blades()` gives angles. Measured: 249 ms lethal per turn at r 0.4 (224 / 236 / 263 at 0.3 / 0.35 / 0.45), ±19° at 0.44 m off the plane.
- `planChamber` places `face_slot` as face variant 3 (`FACE_SLOT_VARIANT`) without changing the rng stream. Greybox `@render/blades` (head extruded from `HEAD_RING`, `look.blade`); dev-only `@render/blade-zone` (dynamic import) toggles with `G`.
- e2e: `blades-kill.spec.ts` and `acceptance.spec.ts`. The acceptance journey walks level 1 with `hazardsOff(true)`; level 0 runs with hazards live (the flame death, and the blade crossed while up).

- 2026-11-14: Resolved. Merged into `main` (milestone-1 greybox spine, tickets 01–08); a code-review fix pass followed (`fix/code-review`, adc9908). On `main`: `pnpm check` (261 unit tests) and `pnpm test:e2e` (35/35) pass.

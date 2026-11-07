# How does the blade's spin-and-contact rule live in core?

Type: grilling
Status: resolved
Blocked by: 06, 07

## Question

[How do flame and blade read, and how do they telegraph, in 3D?](07-hazards-in-3d.md) changed the blade rule by explicit human decision: a constant 360° spin every 1.6 s that kills only when the blade's outline touches the hero, replacing v2's pendulum and whole-tile lethality. Pin down how that rule enters `src/core` (the `hazard-timing` port) so the slice spec can cite it:

- **Hit volume:** what shape and size the hero's hit volume is, as a simulation constant independent of the mesh. The prototype used a 0.4 m × 1.7 m capsule; Pip's contract in [Which hero ships in the slice?](06-slice-hero.md) is about 1.5 m tall within a 1.2 m footprint. Is it one constant for every character?
- **One geometry source:** where the blade outline (pivot height 2.45 m, arm 2.0 m, crescent curves) lives so the core contact test and the bpy blade asset can't drift. A shared JSON, as with `palette.json`?
- **Determinism and replay:** spin phase per blade (seeded from the level RNG, or all in unison as v2's tweens were), spin direction, and whether 1.6 s is fixed for every level or scales with difficulty.
- **Rule interactions:** contact is continuous (it reads the hero's mid-step position), whereas every other hazard re-checks tile occupants. Confirm the 1 s grace, `isFair` (timed hazards stay passable) and the seed-for-seed generator parity are unaffected. Blade placement still needs an east–west corridor; does wall-slot clearance add any constraint?
- **Telegraph:** the blade keeps no telegraph beyond its visible approach (v2 had none). Confirm, given the edge-on risk recorded in 07.

## Answer

**The rule lands in `src/core` as pure 2D geometry: one body capsule, one shared blade outline file, a seeded phase per tile, and a check every tick.** Recorded as [ADR 0002](../../../docs/adr/0002-blade-kills-on-contact.md). The glossary now redefines **Hazard** ("kills what it reaches while live") and adds **Contact**.

### Hit volume

- **One upright body capsule, r 0.4 m, h 1.5 m**, a TS constant in `src/core`. It doesn't depend on any mesh and is the same for every character; character select changes only the look. The contact test takes the capsule as a parameter.
- Measured with the prototype's `bladeTouches`: **height doesn't change the window** (the low crescent makes the contact), so matching Pip's 1.5 m keeps the tuned feel: |θ| < 28°, **249 ms lethal per 1.6 s turn**, and a contact zone of ±0.44 m off the plane. Radius is the difficulty dial: 0.3 → 224 ms, 0.35 → 236 ms, 0.45 → 263 ms.

### One geometry source

- **`src/core/blade-shape.json`** holds the pivot height 2.45, arm 2.0, half-thickness 0.05, the crescent's quadratic control points (outer `[-0.55,0.12] [0,-0.62] [0.55,0.12]`, inner `[0.14,0.26] [0,0.04] [-0.14,0.26]`, head-local with the edge toward −y) and the sample counts (outer 8, inner 4).
- Two readers: `src/core/blade.ts` (contact outline plus the arm segment) and a new `blender/scripts/lib/blade.py` (extrudes the mesh). A Vitest test checks the exported blade GLB's head bounds against the JSON.
- Port source: `timing.ts` on branch `prototype/hazards-in-3d` (`9f022b3`). Its `bladeTouches` / `segSeg` / `pointSeg` are already free of three.js.

### Determinism

- **Phase:** each blade's starting angle comes from `tileRng(levelSeed, col+1000, row+1000)` scaled to the turn, the same derivation v2 uses for flames and spikes (v2's blades all swung together). The generator stream isn't touched, so seed-for-seed parity holds.
- **Shared-wall lock:** two blades in the same column two rows apart share the wall tile between them. At full swing a crescent reaches 2.62 m from its pivot, so their heads would cross over that wall. The southern blade takes the northern one's phase: the two are then shifted copies 4 m apart and can't overlap. This happens 0 times in the 72 baseline levels (163 blades), but the generator allows it.
- **Direction:** every blade turns the same way. θ = 0 is head straight down, and θ increases as the head swings south (toward the camera) at the bottom. The outline is symmetric and the hero always crosses the plane from east or west, so direction never affects the rule.
- **Period:** `HAZARD_TIMING.bladeSpin = 1600` ms, the same on every level. v2 never changed hazard timing by level.

### Rule interactions

- **Sampling:** once per fixed tick (1/60 s), at each body's mid-step position. That position moves at a constant speed from the old tile centre to the new one over the step (hero 120 ms; v2 `Linear`, and the hero takes the destination tile from the step's start). A tick moves the blade 3.75°, against a ±28° window, so a hit can't fall between ticks and no swept test is needed. Checking every tick also covers the go-live occupant re-check for blades.
- **Constraint passed to render interpolation:** the hero (and later mummies) must move on screen at the same constant speed as the simulation, so what you see is what kills.
- **Unaffected:** the 1 s grace (it covers blade contact like any hit, and only the hero has grace), `isFair` (blades are timed, so passable; about 1.35 s clear per turn), the generator, `isHorizontalCorridor` placement and the baseline fixture.
- **Wall slots:** no new placement rule. The crescent stays inside the north and south wall tiles, except in the shared-wall case handled above. `planChamber` must know which wall tiles carry a slot so it can pick a slotted kit variant; that's a spec detail.

### Telegraph

None beyond seeing the blade come round, as in v2. The edge-on risk from [How do flame and blade read, and how do they telegraph, in 3D?](07-hazards-in-3d.md) stays accepted. The fallbacks are still the ember edge or a tile decal.

### Mummies (human call: blades kill them)

- Blade contact kills mummies. They use the same body capsule and are checked every tick at their mid-step position, which moves at a constant speed over their own step time (chase 300 ms, patrol 400 ms). As with any v2 hazard kill, a dead mummy is removed for the rest of the level. Mummies get no grace. Killing a mummy only opens a level up, so `isFair` doesn't change.
- **Avoidance is deferred to the mummy-AI port, with a warning:** v2's `isLethal` ("an active hazard occupies the tile", checked before each step) doesn't port as it is. A mummy that steps onto a blade tile while the blade is up then stands at the centre for its 450–600 ms pause, and usually dies. Options for that milestone: look ahead over the step and the pause, treat blade tiles as walls, or accept the deaths.

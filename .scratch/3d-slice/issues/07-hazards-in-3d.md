# How do flame and blade read, and how do they telegraph, in 3D?

Type: prototype
Status: resolved
Blocked by: 01, 02, 03

## Question

How do the flame (nozzle, idle → hot telegraph → firing) and blade (swinging axe in a walled east-west corridor) hazards look and telegraph from the camera chosen in 01, staying strictly inside `HAZARD_TIMING`? Prototype both in three.js so the human can judge whether a hazard's live tile is unambiguous in perspective. Questions to settle: particles vs mesh flame; blade swing plane relative to the camera; whether the live tile gets a floor decal or glow; how flame light fits the budget from 03.

## Answer

**Flames read as light, not geometry. Blades spin a full turn across the corridor, and the blade rule changes (human call).** Chosen from the prototype's variants and tuned live (preset **D**):

```json
{
  "flame": "shader",
  "flameHeight": 3.6,
  "nozzleHeat": true,
  "embers": true,
  "flameDecal": "glow",
  "poolLights": true,
  "flameLight": 2,
  "bladeSpin": 1.6,
  "bladePlane": "across",
  "bladeTrail": false,
  "bladeEdge": false,
  "bladeDecal": "none",
  "bloom": 0.45
}
```

### Flame

- **Shader column, not a mesh or particles.** An open cone (top radius 0.16 m, base 0.6 m), additive. A scrolling fbm runs seamlessly round the circumference, mapped through the fire ramp `EMBER` → `FIRE` → `FIRE_HOT` → `FIRE_CORE` at HDR gain ≈ 2.4 so it blooms.
- **Exaggerated height: 3.6 m.** At the ≈65° pitch from 01, vertical extent shows at only sin 25° ≈ 42%, so 3.6 m reads as about 1.5 m on screen. Real-height flames (1.8 m) looked squat.
- **Telegraph, all inside the 500 ms:** the floor grate's bed heats `EMBER_DARK` → `FIRE_HOT` (sine-in), embers rise from the grate (about 36/s), and the pool light ramps to 0.45 of peak. Ignite and extinguish keep v2's shapes: back-out 0.3 → 1 in 120 ms, collapse to 0.2 in 120 ms, then the grate cools over 250 ms.
- **Floor: an additive radial `glow` decal** (3.4 m), a fake light spill. It ramps `EMBER` → `FIRE_HOT` through the telegraph and holds `FIRE` with flicker while live. No tile-border mark.
- **Lights: ticket 03's 4-slot pool stays, but quiet** (peak scale 2). The glow decal and bloom carry most of the light. Bloom strength **0.45**, threshold 1.0.
- **Rule unchanged:** the whole tile is lethal while `on` (v2 `HAZARD_TIMING`, occupant re-check).

### Blade (look)

- **Swing plane `across`:** north–south, wall to wall, through **full-height slots** in the corridor walls. The head cuts the wall tops on every turn.
- **Mount:** two stone lintels (`STONE_DARK`) on the wall tops, one each side of the swing plane, with a steel axle between them, so the head clears them over the top. Steel head and haft (`STEEL_LIGHT` / `STEEL_DARK`, metal), crescent edge down.
- **No ghost trail, no ember edge, no floor decal.** The human judged the moving steel against the slots enough.
- **Known risk, accepted after play:** at the lethal moment the blade points straight down and is edge-on to the north camera, a thin line between the lintels. If playtests show players misreading it, the cheap fixes the prototype already proved are the ember edge (`bladeEdge`) or a tile decal.

### Blade (rule change, explicit human decision in this session)

The human changed the blade rule while reviewing the prototype. This **replaces v2's** ±40° Sine.easeInOut pendulum (1100 ms half-swing, live while |θ| < 22°, about 408 ms lethal per 1.1 s pass):

1. **The blade spins a full 360° at constant speed**, one turn every **1.6 s**.
2. **It kills only on contact.** The blade's outline (haft plus crescent) in its swing plane must touch the hero's hit volume at the hero's actual position on that tick, including mid-step. Passing beneath it while it's up is safe.
3. In the prototype (hit capsule radius 0.4 m, height 1.7 m) that is contact while |θ| < 28° for a hero at the tile centre: **about 250 ms lethal per 1.6 s turn**, leaving about 1.35 s clear. A hero just starting the step onto the tile (0.44 m off the plane) is still clipped within ±19°.

The test is pure 2D geometry (blade outline segments against a slice through the capsule), so it stays deterministic and belongs in `src/core`. How it lands there (hit volume vs Pip's contract, the shared blade outline, phases, generator fairness) is ticketed separately: [How does the blade's spin-and-contact rule live in core?](09-blade-contact-rule.md).

### Live tile in perspective

- Flames: the tall column plus the glow spill mark the tile. In the adjacent off-phase pair, the tile-border decal (variant B) separated the two tiles best; the human preferred the glow. Revisit only if playtests show misreads.
- Blades: contact replaces "live tile" as the rule, so the swing itself is the read.

**Rejected:** mesh-teardrop and particle flames; tile-border and no-decal flame floors; real-height (1.8 m) flames; the east–west (`along`) swing plane; v2 ghost trail and ember edge; floor `tile` / `sweep` blade decals; v2's pendulum timing and whole-tile blade lethality.

Prototype (primary source): branch `prototype/hazards-in-3d` (local commit `9f022b3`, not merged). Run `pnpm prototype:hazards` on that branch. It opens preset D; A–C are the rejected readings, and `G` overlays ground-truth lethal tiles.

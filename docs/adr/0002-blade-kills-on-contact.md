# The blade kills on contact, not by tile

v2's blade is a ±40° pendulum (1100 ms per half-swing) that kills anything on its tile while |θ| < 22°. In 3D, with the blade spinning a full turn north–south through wall slots, a whole-tile rule looked wrong: the hero died while the blade was visibly overhead. By explicit human decision, the blade now spins a full 360° at a constant speed, one turn every 1.6 s, and **kills only on contact**: its outline, in the swing plane, touching a body's hit capsule at that body's actual position on the tick, mid-step included. Walking under the blade while it's up is safe. It is the one deliberate exception to "v2's rules carry over exactly". Every other hazard still kills the whole tile.

## Considered options

- **Port v2's pendulum and tile rule exactly**: keeps rule parity, but in perspective the blade kills where it visibly isn't. Rejected after playing the prototype.
- **Spin, but keep whole-tile lethality for an angle window**: simpler (no geometry in core), but keeps the same mismatch between what you see and what kills.
- **Contact against the rendered mesh**: what you see is exactly what kills, but it puts three.js in the simulation and ties the rule to the art. Rejected in favour of a shared outline file.

## Consequences

- `src/core` gains pure 2D geometry: blade outline segments tested against the 2D slice of a capsule. The outline lives in `src/core/blade-shape.json`, read by both the core test and the bpy blade builder, so the rule and the mesh can't drift.
- Bodies have a simulation hit volume that doesn't depend on any mesh: one upright capsule (r 0.4 m, h 1.5 m) shared by the hero and mummies. Changing its radius changes difficulty (0.3 m → 224 ms lethal per turn, 0.4 m → 249 ms, 0.45 m → 263 ms). Changing its height doesn't.
- Contact is checked every fixed tick at each body's mid-step position, which moves at a constant speed. Render has to move bodies the same way, or what you see stops matching what kills.
- Blades get a seeded phase per tile (unlike v2's unison swing). Blades that share a wall tile share a phase so they never cross over it.
- Mummies die on blade contact, and v2's mummy avoidance ("is the tile lethal right now?") no longer fits. It has to be redesigned when the mummy AI is ported.

Full decision: `.scratch/3d-slice/issues/07-hazards-in-3d.md` (the rule change) and `.scratch/3d-slice/issues/09-blade-contact-rule.md` (how it lives in core).

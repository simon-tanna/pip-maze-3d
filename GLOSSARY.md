# Glossary

**Level**: one entry in the level sequence, identified by its index and seed. The same index and seed always produce the same level.
_Avoid_: stage, round

**Map**: a level's tile grid. Every tile is floor, wall, start or chest.
_Avoid_: layout, board

**Chamber**: a map built as a 3D space the hero walks through. One level, one chamber.
_Avoid_: room (a room is a feature carved inside a map), dungeon

**Arena**: the boss fight's space. It is not generated from a level.

**Tutorial**: the three-phase training mode (blade, flame, spike). Each phase is a demo followed by practice.

**Hazard**: a timed, stationary trap on a tile: flame, spike or blade. It cycles on a fixed timing and kills what it reaches while live. A flame or spike reaches its whole tile; a blade reaches only what its edge touches (see Contact).
_Avoid_: trap (fine in casual speech, but the canonical term is hazard)

**Contact**: how a blade kills: its outline touching a body's hit volume, wherever that body is, including mid-step. Passing beneath a blade while it's up is safe.
_Avoid_: whole-tile (for blades)

**Mummy**: a moving enemy that patrols, chases and returns. It is not a hazard: it moves, and it has its own placement rules.
_Avoid_: enemy (too broad once the boss exists)

**Pickup**: a key, coin or chest. The hero collects it by landing on its tile. Only pickups are gold.
_Avoid_: item, collectible, loot

**Decor**: purely visual props (bones, rubble, pots, moss) scattered on plain floor beside walls. Placed by the seed, never on a hazard, pickup or the critical path, and never affects play.
_Avoid_: props, clutter

**Grace**: the 1 s after a respawn during which hazards ignore the hero.
_Avoid_: invulnerability, i-frames

**Telegraph**: the warning window before a hazard goes live. It sits inside the hazard's original timing, so it never changes difficulty.

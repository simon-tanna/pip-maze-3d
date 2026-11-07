# How should the camera follow the hero, and how do arrow keys map to grid moves?

Type: prototype
Status: resolved
Blocked by:

## Question

What third-person camera does the slice use? Options include fixed yaw (always looking 'north' along -z, so arrows map 1:1 to grid directions), yaw that follows the hero's facing, and a user-orbitable camera. Also: height and pitch, follow lag, and whether input is camera-relative or world-relative. Build a cheap three.js prototype (capsule hero on a greybox maze, 120 ms grid steps) so the human can feel the options side by side. The answer must also say how far forward the player needs to see to react to a hazard telegraph, which feeds wall height and occlusion in 05.

## Comments

- 2026-11-05: prototype built (uncommitted, awaiting the human's verdict): `pnpm prototype:camera` → `prototype-camera.html?variant=A..D`, code in `src/prototype-camera/`. Variants: A fixed north chase, B facing follow, C player orbit (Q/E + drag), D fixed diagonal. Live tunables (dist, height, fov, lag, lead, wallH, turnDelay) and a lookahead meter (need ≥5 tiles ≈ 500 ms telegraph at 120 ms/tile). On verdict: commit the prototype to `prototype/camera-and-input`, then drop it from main.
- 2026-11-07: human verdict: variant A with tuned values; "Down can't turn hero" clarified to the opposite-key rule below.

## Answer

**Camera: fixed-yaw north chase (prototype variant A).** Yaw is locked looking north (along -z, so +x is screen-right and row 0 is far). The camera never rotates and the player cannot orbit it. Chosen tuning (from the prototype's "Copy settings"):

| Tunable  | Value  | Meaning                                                                  |
| -------- | ------ | ------------------------------------------------------------------------ |
| `dist`   | 7 m    | horizontal offset behind (south of) the look-at point                    |
| `height` | 15.7 m | camera height; pitch ≈ 65° down                                          |
| `fov`    | 57°    | vertical FOV                                                             |
| `lag`    | 0.12 s | exponential follow smoothing (`1 - exp(-dt/lag)`), in `render` only      |
| `lead`   | 1 m    | look-at point pushed ahead of the hero along its facing                  |
| `wallH`  | 2.2 m  | greybox wall height that kept the hero and lookahead clear (input to 05) |

**Input: world-relative, 1:1.** Up/W = north (row −1), Down/S = south, Left/A = west, Right/D = east. Every key is a fixed grid direction, so screen, grid and key always agree. There is no camera-relative mapping, so `cameraRelativeDir` is not needed.

- The hero turns to face the direction of each step it takes. Turning around is pressing the opposite key (facing east at an east dead end, Left turns the hero and walks it west).
- A key that points into a wall does nothing: no move, no turn in place, facing unchanged (v2 behaviour). v2's 180 ms buffer and newest-held-wins rules carry over unchanged.

**Lookahead needed:** the 500 ms flame telegraph at 120 ms/tile is about 4.2 tiles, so the player must see **≥ 5 clear tiles** ahead (or the whole corridor when it's shorter). With the chosen tuning and 2.2 m walls, the prototype measured: east 7/7, west 8/11, south 3/3, north 3/3 (full corridor). The hero was never occluded. So the slice needs no wall fade or cutaway at this height and pitch. 05 can treat 2.2 m as the starting wall height and only revisit occlusion if real kit pieces get taller.

**Rejected:** B, facing-follow (the 180° camera swing on reversal fights grid play); C, player orbit (camera management competes with dodging); D, fixed diagonal (every arrow lands between two axes).

Prototype (primary source): branch `prototype/camera-and-input` (local commit, not merged). Run `pnpm prototype:camera` on that branch.

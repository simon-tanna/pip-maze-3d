# pip-maze-v-2 → doom-maze-3d port map

Source: `../pip-maze-v-2` (Phaser 4, 2D, 40×15 tiles at 48 px). Read its `CLAUDE.md` before porting a module.
Status: `src/core/grid.ts` done; everything else not ported yet.

## Pure logic: port almost verbatim into `src/core/` (JS → strict TS, no three.js)

| v2 module                                                                                               | Destination                   | Notes                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `centre(n)` (copied in `Game.js`, `hazards.js`, `mummy-ai.js`, `coins.js`) + `tileKey` (`generator.js`) | `@core/grid` (**done**)       | `tileToWorld` / `tileKey`. Import from here; don't re-derive.                                                                                  |
| `lib/generator.js` (`mulberry32`, `generateLevel`, `LEVEL_CONFIGS`, `isFair`, coins)                    | `src/core/generator.ts`       | Must stay **seed-identical**: port `tests/generator-coins.test.mjs` + `tests/fixtures/generator-baseline.json` to Vitest first, then the code. |
| `lib/grid-path.js` (BFS, distance field, Bresenham LOS)                                                 | `src/core/grid-path.ts`       | Typed arrays carry over.                                                                                                                       |
| `lib/mummy-ai.js` (PATROL → ALERT → CHASE → SEARCH → RETURN)                                            | `src/core/mummy-ai.ts`        | Separate the state machine from Phaser tweens; the 3D view interpolates.                                                                       |
| `HAZARD_TIMING` (in `lib/hazards.js`)                                                                   | `src/core/hazard-timing.ts`   | Timings define difficulty, so keep them unchanged.                                                                                             |
| `lib/tutorial-config.js`                                                                                | `src/core/tutorial-config.ts` | Data only.                                                                                                                                     |
| `lib/player-db.js` (localStorage names + coins)                                                         | `src/game/player-db.ts`       | Touches `localStorage`, so it lives outside core.                                                                                              |

## Rewritten for 3D

| v2                                                      | 3D destination                                   | Notes                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `environment.js` (autotiled walls, `drawChamber`)       | `src/render/chamber.ts` + Blender wall/floor kit | 4-bit autotile mask → choose wall mesh variant; use `InstancedMesh` per variant.                             |
| `hazard-art.js` + `hazards.js` visuals                  | Blender models + `src/render/hazards/*`          | Spike / flame nozzle / axe blade / mummy as .glb; the logic stays in core.                                   |
| `hero.js` (outline, squash, dust)                       | `src/render/hero.ts` + rigged Blender character  | `AnimationMixer` idle/walk; v2 sprite sheets are only reference for Pip/John/Ellen.                          |
| `grid-input.js` (buffer, hold-to-walk, corner assist)   | `src/game/grid-input.ts`                         | Keep the behaviour; directions become camera-relative for third-person.                                      |
| `fx.js` (shake, hitStop, iris, particles)               | `src/render/fx.ts`                               | Honour `prefers-reduced-motion`.                                                                             |
| `palette.js` (`P`, `LIGHT`)                             | `src/render/palette.ts`                          | Still the only place hex colours live.                                                                       |
| `ui.js`, `Hud.js`, `dpad.js`                            | `src/ui/*` (DOM overlay on `#hud`)               | HTML/CSS, not three.js.                                                                                      |
| Scenes (Boot, Player, Title, Game, Win, Tutorial, Boss) | `src/game/state.ts`                              | A small state machine on top of `createFixedLoop` (see the M1 spec); per-scene modules later only if needed. |

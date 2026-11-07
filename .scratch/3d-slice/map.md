# Map: Doom Maze 3D, the way to a first playable slice

Labels: wayfinder:map

## Destination

The cross-cutting 3D design calls are locked (camera and input, art direction, chamber build, hero, how hazards read). A milestone-1 spec, ready to split into `ready-for-agent` issues, describes the **vertical slice**: level 0 exactly as generated (flame and blade hazards, 2–5 coins, single key, no mummies), walked in third person on desktop keyboard. Reaching the chest moves on to level 1 through a bare transition.

## Notes

- Domain: a 3D port of v2 (`../pip-maze-v-2`). Read `docs/v2-port-map.md`, v2's `CLAUDE.md`, and `GLOSSARY.md` (Level / Map / Chamber / Hazard / Contact / Mummy / Grace / Telegraph).
- **Rules are fixed, presentation is free.** v2's rules carry over exactly: `HAZARD_TIMING`, 120 ms grid steps, `isFair`, seed-identical levels, dual keys, coins, 1 s respawn grace. Anything that would change a rule gets its own ticket and an explicit decision. One deliberate exception so far: the blade (360° spin, kills on contact), decided in the hazards ticket and specified in [How does the blade's spin-and-contact rule live in core?](issues/09-blade-contact-rule.md) (ADR 0002).
- The `src/core` ports (generator, grid-path, mummy-ai, hazard-timing, tutorial-config) are clear work **outside** this map: tests first, then code, matching seed for seed. The slice spec assumes `generator`, `grid-path` and `hazard-timing` exist.
- Who builds: agents write TypeScript and bpy scripts, art included (bpy-procedural unless a ticket says otherwise). The human reviews art and owns the feel calls (camera, look). Write specs at a detail agents can act on, and mark feel and art decisions HITL.
- Skills: `grilling` + `domain-modeling` for grilling tickets, `prototype` for prototype tickets, `research` for research tickets, `threejs-builder` (in `.claude/skills/`) for three.js patterns. Check r187 APIs via Context7 / `node_modules/three`.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [What lighting and shadow budget does three r187 allow for torch + flame lights?](issues/03-lighting-budget.md): one shadowed directional key light; unshadowed torch; a fixed pool of 4 unshadowed flame lights (intensity-only changes, never toggled) plus emissive and decal fakes; stay on WebGLRenderer.
- [How does a rigged, animated character get from Blender 5.2 to three r187 via glTF?](issues/04-character-pipeline.md): bpy-scripted hand rig (12–16 bones); ACTIONS export with fake users and slide-to-zero; a skinned profile in `export_glb`; `loadCharacter()` with `SkeletonUtils.clone`; walk cycle at 0.24 s.
- [How should the camera follow the hero, and how do arrow keys map to grid moves?](issues/01-camera-and-input.md): fixed-yaw north chase (7 m back, 15.7 m up, ≈65° pitch, fov 57, lead 1 m); arrows map 1:1 to grid, opposite key turns the hero, a blocked key does nothing; ≥5 clear tiles of lookahead, met with 2.2 m walls and no cutaways.
- [What does Torchlit Sandstone look like in 3D?](issues/02-art-direction.md): stylised PBR with bpy-procedural, palette-input materials (CC0 for greyscale detail only, AO baked); `palette.json` shared by TS and bpy; NW key at 55–60°, palette gradient env map, Neutral tone mapping, bloom + vignette; pickups glow without real lights; feel values in `look.ts` with a dev panel.
- [How is a map built into a chamber?](issues/05-chamber-build.md): pure `planChamber` in core → one `InstancedMesh` per kit piece; a cap per wall tile and a face per open neighbour (v2 mask); 2.2 m walls with no cutaway; a render-only cap ring padding the map (9 E/W, 5 N, 4 S); contact-AO strips; one bpy `kit/chamber.glb`; shadow frustum fixed to the map; `planDecor` ported as the last, cuttable issue.
- [Which hero ships in the slice: a placeholder or a rigged character?](issues/06-slice-hero.md): Pip, rigged and built against a written character contract (bones, `idle`/`walk` clips, material slots named after a new reserved `HERO_*` palette block); agents build Pip in bpy from the concept in `docs/art/`, in two passes, with the human reviewing (amended during the slice spec); clips own squash and breath; the rig does the hit flash, death and respawn pops and the grace flicker; grace is simulation state; no torch prop.
- [How do flame and blade read, and how do they telegraph, in 3D?](issues/07-hazards-in-3d.md): flames read as light: a 3.6 m shader column (exaggerated for the 65° pitch) with grate heat, embers and a glow floor decal over a quiet 4-slot light pool, bloom 0.45. Blades spin north–south through wall slots under twin lintels, with no trail, edge or decal. Rule change by human call: a 360° spin every 1.6 s that kills only on contact.
- [How does the blade's spin-and-contact rule live in core?](issues/09-blade-contact-rule.md): pure 2D contact in `src/core` against one body capsule (r 0.4, h 1.5; 249 ms lethal per turn); the outline in a shared `src/core/blade-shape.json` (core + bpy); seeded phase per tile, with blades that share a wall locked together; 1.6 s fixed; checked every tick at constant-speed mid-step positions; no telegraph; blades kill mummies too. ADR 0002.
- [Write the milestone-1 slice spec](issues/08-slice-spec.md): [`spec.md`](../m1-slice/spec.md), split into 17 tickets in `.scratch/m1-slice/issues/` for levels 0 and 1 plus an end card. The fog was settled inside it at v2 parity: a shared `stepPosition`, death as simulation timers with a camera hold-and-cut, DOM HUD and iris, a bpy `pickups.glb`, pooled particles, a five-state machine, a `__game.sim` e2e hook, 60 fps on the MacBook.

## Not yet specified

Nothing. The Destination is reached: the spec is split into `ready-for-agent` tickets in `.scratch/m1-slice/`.

## Out of scope

Later milestones, not this map: mummies (including how they avoid blades: v2's `isLethal` check doesn't port as it is, see the blade ticket), spikes, Tutorial, Arena / boss, Player / Title / Win screens, character select, touch d-pad, `player-db` persistence, audio (no sound system in v2 to port, and the slice spec doesn't need one).

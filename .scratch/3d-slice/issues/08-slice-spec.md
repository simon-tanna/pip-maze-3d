# Write the milestone-1 slice spec

Type: grilling
Status: resolved
Blocked by: 05, 06, 07, 09

## Question

Turn the decisions on this map, plus whatever fog has graduated by then (HUD, death and respawn feel, level transition, interpolation), into `.scratch/3d-slice/spec.md`: a milestone-1 spec for the vertical slice described in the map's Destination, sliced finely enough for `ready-for-agent` issues, with the HITL art and feel work called out.

## Answer

**Written: [`spec.md`](../../m1-slice/spec.md), ready to split (since split into 17 tickets in `.scratch/m1-slice/issues/`).** The fog was decided inside this session rather than graduated, with v2 behaviour translated to 3D as the default for each patch:

- **Scope:** levels 0 **and** 1 (`LEVEL_CONFIGS[1]` also has only flames and blades), then an end card that restarts. Audio is out of scope.
- **Run:** `?seed=&level=` URL params, or a logged `crypto` boot seed. Coins are banked in memory only.
- **Interpolation:** one pure `stepPosition` in core, shared by blade contact and the hero view. Position is linear, never eased. 60 ms render-only turns.
- **Death:** timers in `update` (respawn and grace start at 270 ms, input at 530 ms). v2's screen FX: a DOM `BLOOD` flash, a shake, no hit-stop. The camera holds, then cuts to the start tile.
- **HUD:** v2's chamber HUD in DOM, with fly-to from projected pickup positions.
- **Pickups:** a bpy `pickups.glb` (key, coin, chest, lid); bob and turn; v2's chest-open chain.
- **FX:** v2's four particle pools as pooled billboards.
- **Transition:** a five-state machine, a CSS radial iris, teardown that never touches lights.
- **Pip:** agents build Pip from the concept (amends [Which hero ships in the slice?](06-slice-hero.md)), in two passes. Corner assist ports with `grid-input`.
- **Acceptance:** scripted e2e through a dev `__game.sim` hook, plus 60 fps at 1080p on the human's MacBook. An early light-bench issue tests ticket 03's estimates.
- The `generator`, `grid-path` and `hazard-timing` ports stay external prerequisites. The blade rule (`blade.ts`) and `planChamber` are slice issues.

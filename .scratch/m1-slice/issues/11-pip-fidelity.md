# 11: Pip fidelity pass

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** Pip v1 is refined towards `docs/art/pip-concept.png` until the human signs off. The agent iterates with a render-and-compare loop, not blind.

- Add headless Blender renders to the Pip script: a turnaround (front, three-quarter, side, back) plus a shot from the game camera (65° pitch, about 90 px tall at 1080p).
- Refine against the concept: tall olive hat with band and wide brim; heavy brows; moustache; the red scar over the left eye; navy knee-length coat with collar, buttons and brown pocket patch; chunky black gloves; brown boots. Face details are small geometry in their own `HERO_*` slots, never painted colour.
- Refine the `idle` and `walk` clips for feel.
- Stay inside the contract; the ticket 10 GLB check must keep passing.
- **Freeze for ticket 15:** the material slot names, the root and the bone layout are fixed once this ticket is agent-complete. Record them on the ticket.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Render outputs are linked on this ticket for each iteration, side by side with `docs/art/pip-concept.png`
- [ ] The frozen slot names and bone layout are recorded on this ticket
- [ ] Human sign-off (a dated line under `## Comments`) on silhouette, face read at game scale, and walk feel, against the concept PNG. Not needed for agent-complete
- [ ] The ticket 10 GLB check still passes
- [ ] `pnpm check` and `pnpm test:e2e` pass

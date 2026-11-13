# 17: Acceptance

Spec: [Milestone 1, the vertical slice](../spec.md)

**What to build:** The human plays the slice and signs it off. See the spec's _Acceptance_ and _Non-functional requirements_.

- Tune the look module live in the real chamber (lights, bloom, vignette, materials, feel values) and commit the values. If tuning touches baked materials, rebuild through `pnpm assets:build`.
- Play levels 0 and 1 to the end card on the MacBook at 1080p, DPR 1, bloom on.
- Collect the outstanding human sign-offs from 09–15 (dated lines under each ticket's `## Comments`).

**Blocked by:** 01–16 (16 may be cut)

**Status:** ready-for-human

- [ ] The MacBook's chip is recorded on this ticket
- [ ] The frame-time readout's summary for a full levels 0–1 run (transitions included) is recorded here. Target: p95 ≤ 16.7 ms. This is a soft gate: on a miss, the cause is recorded with a follow-up ticket, and sign-off can still proceed
- [ ] Load to first `playing` is under 3 s with a warm cache
- [ ] Tuned look values are committed
- [ ] The full e2e suite passes, including ticket 08's acceptance journey
- [ ] Every sign-off from 09–15 is recorded
- [ ] The human signs off on the slice

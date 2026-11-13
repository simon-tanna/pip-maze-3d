/**
 * Guards the fixed light rig (ADR 0001): adding, removing or toggling a light changes
 * the shader program key and recompiles every lit material mid-play. Armed after the
 * first rendered frame, the guard checks every frame that each probe (the collected light
 * count, `renderer.info.programs.length`, …) still equals its baseline.
 */
export interface RigViolation {
  probe: string;
  expected: number;
  actual: number;
}

export interface RigGuard {
  /** Snapshot every probe as the baseline. */
  arm(): void;
  /** Compare every probe with the baseline (no-op until armed). */
  check(): void;
  readonly baseline: Readonly<Record<string, number>> | null;
  readonly violations: readonly RigViolation[];
}

export function createRigGuard(
  probes: Record<string, () => number>,
  onViolation?: (v: RigViolation) => void,
): RigGuard {
  let baseline: Record<string, number> | null = null;
  const last: Record<string, number> = {};
  const violations: RigViolation[] = [];
  return {
    arm() {
      baseline = {};
      for (const [name, probe] of Object.entries(probes)) baseline[name] = last[name] = probe();
    },
    check() {
      if (!baseline) return;
      for (const [name, probe] of Object.entries(probes)) {
        const actual = probe();
        if (actual !== last[name] && actual !== baseline[name]) {
          const v = { probe: name, expected: baseline[name] ?? NaN, actual };
          violations.push(v);
          onViolation?.(v);
        }
        last[name] = actual;
      }
    },
    get baseline() {
      return baseline;
    },
    violations,
  };
}

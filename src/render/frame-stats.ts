/**
 * Frame-time recorder behind the dev readout. Keeps a rolling window of frame
 * durations and summarises it the way the light bench and spec NFRs read it.
 */
export interface FrameSummary {
  frames: number;
  meanMs: number;
  /** Nearest-rank 95th percentile. */
  p95Ms: number;
  worstMs: number;
  /** Frames slower than 33 ms (a dropped frame at 30 fps). */
  over33: number;
}

export interface FrameStats {
  record(frameMs: number): void;
  summary(): FrameSummary;
  reset(): void;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** `window` is the number of most recent frames kept (default ~3 min at 60 fps). */
export function createFrameStats(window = 10_800): FrameStats {
  const samples = new Float64Array(window);
  let count = 0;
  let next = 0;
  return {
    record(frameMs) {
      samples[next] = frameMs;
      next = (next + 1) % window;
      count = Math.min(count + 1, window);
    },
    summary() {
      if (count === 0) return { frames: 0, meanMs: 0, p95Ms: 0, worstMs: 0, over33: 0 };
      const sorted = samples.slice(0, count).sort();
      let sum = 0;
      let over33 = 0;
      for (const ms of sorted) {
        sum += ms;
        if (ms > 33) over33++;
      }
      return {
        frames: count,
        meanMs: round(sum / count),
        p95Ms: round(sorted[Math.ceil(0.95 * count) - 1] ?? 0),
        worstMs: round(sorted[count - 1] ?? 0),
        over33,
      };
    },
    reset() {
      count = 0;
      next = 0;
    },
  };
}

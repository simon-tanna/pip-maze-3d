/**
 * The look registry: every feel value lives in a named section, and every section
 * registers here so the dev panel can show it. Values are plain mutable objects; the
 * panel writes to them and render code reads them each frame, so tuning is live.
 */
export type LookValue = number | boolean;
export type LookValues = Record<string, LookValue>;
/** Slider range for a numeric value: [min, max, step]. */
export type LookRange = readonly [min: number, max: number, step: number];
export type LookRanges<T extends LookValues> = {
  [K in keyof T as T[K] extends number ? K : never]?: LookRange;
};

export interface LookSection<T extends LookValues = LookValues> {
  readonly name: string;
  readonly values: T;
  readonly ranges: LookRanges<T>;
}

export interface LookRegistry {
  /** Register a section and return its live values object. Names are unique. */
  section<T extends LookValues>(name: string, values: T, ranges?: LookRanges<T>): T;
  /** Every registered section, in registration order. */
  sections(): readonly LookSection[];
}

export function createLookRegistry(): LookRegistry {
  const list: LookSection[] = [];
  return {
    section(name, values, ranges = {}) {
      if (list.some((s) => s.name === name))
        throw new Error(`look section "${name}" already exists`);
      list.push({ name, values, ranges } as LookSection);
      return values;
    },
    sections: () => list,
  };
}

/** The game's one registry. Domain sections (`look/<domain>.ts`) register into it. */
export const lookRegistry = createLookRegistry();
/** Register a domain section with the shared registry (and so with the dev panel). */
export const section = lookRegistry.section;

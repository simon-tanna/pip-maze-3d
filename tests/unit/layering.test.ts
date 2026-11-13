import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** Layer bars from eslint.config.js (CLAUDE.md → Architecture; spec → HUD and overlays). */
const eslint = new ESLint();

async function restricted(filePath: string, source: string): Promise<boolean> {
  const [result] = await eslint.lintText(`${source}\nexport {};\n`, { filePath });
  return (result?.messages ?? []).some((m) => m.ruleId === 'no-restricted-imports');
}

describe('layering', () => {
  it.each([
    ["import { Vector3 } from 'three';"],
    ["import { css } from '@render/palette';"],
    ["import { look } from '../render/look';"],
  ])('src/ui may not %s', async (line) => {
    expect(await restricted('src/ui/probe.ts', line)).toBe(true);
  });

  it('src/ui may import core types', async () => {
    expect(await restricted('src/ui/probe.ts', "import type { WorldXZ } from '@core/grid';")).toBe(
      false,
    );
  });

  it('src/render may not import ui', async () => {
    expect(await restricted('src/render/probe.ts', "import { createHud } from '@ui/hud';")).toBe(
      true,
    );
  });
});

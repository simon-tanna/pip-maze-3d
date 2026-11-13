import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIGHT, P, color, css } from '@render/palette';
import type { ColorName } from '@render/palette';

const paletteScript = fileURLToPath(
  new URL('../../blender/scripts/lib/palette.py', import.meta.url),
);

describe('palette', () => {
  it("carries v2's Torchlit Sandstone values", () => {
    expect(P.INK).toBe('#0e0a0c');
    expect(P.STONE).toBe('#8f6a4c');
    expect(P.GOLD_LIGHT).toBe('#ffe592');
    expect(Object.isFrozen(P)).toBe(true);
  });

  it('resolves LIGHT entries that name a P colour', () => {
    expect(LIGHT.AMBIENT).toBe('#9a8890');
    expect(LIGHT.TORCH).toBe(P.FIRE_HOT);
    expect(LIGHT.FLAME).toBe(P.FIRE);
    expect(Object.isFrozen(LIGHT)).toBe(true);
  });

  it('reserves a HERO block whose hat hue differs from MOSS', () => {
    for (const key of [
      'HERO_HAT',
      'HERO_COAT',
      'HERO_COAT_DARK',
      'HERO_SKIN',
      'HERO_LEATHER',
      'HERO_GLOVE',
    ]) {
      expect(P).toHaveProperty(key);
    }
    expect(P.HERO_GLOVE).not.toBe(P.INK);
    const hue = (name: ColorName) => color(name).getHSL({ h: 0, s: 0, l: 0 }).h * 360;
    expect(Math.abs(hue('HERO_HAT') - hue('MOSS'))).toBeGreaterThan(25);
  });

  it('color() returns linear RGB and css() the sRGB hex', () => {
    const c = color('SAND');
    expect(c.getHexString()).toBe('d8b98a'); // round-trips through sRGB
    expect(c.r).toBeCloseTo(0.686, 2); // linear, not 0xd8 / 255
    expect(css('BLOOD')).toBe('#b3241d');
    expect(css('TORCH')).toBe(P.FIRE_HOT);
    expect(color('TORCH').getHexString()).toBe(P.FIRE_HOT.slice(1));
  });

  it('bpy reads the same JSON and gets the same linear RGB', () => {
    const out = execFileSync('python3', [paletteScript], { encoding: 'utf8' });
    const linear = JSON.parse(out) as Record<string, [number, number, number]>;
    const names = [...new Set([...Object.keys(P), ...Object.keys(LIGHT)])] as ColorName[];
    expect(Object.keys(linear).sort()).toEqual([...names].sort());
    for (const name of names) {
      const c = color(name);
      const [r, g, b] = linear[name] ?? [];
      expect(r).toBeCloseTo(c.r, 5);
      expect(g).toBeCloseTo(c.g, 5);
      expect(b).toBeCloseTo(c.b, 5);
    }
  });
});

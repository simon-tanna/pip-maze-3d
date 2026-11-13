import { describe, expect, it } from 'vitest';
import { createLookRegistry } from '@render/look/registry';
import { look, lookSections } from '@render/look';

describe('look registry', () => {
  it('returns the live values object for a section', () => {
    const reg = createLookRegistry();
    const fx = reg.section('fx', { dustCount: 3, shake: true }, { dustCount: [0, 20, 1] });
    expect(fx.dustCount).toBe(3);
    fx.dustCount = 5; // the panel mutates this object; readers see it next frame
    expect(reg.sections()[0]?.values.dustCount).toBe(5);
  });

  it('lists sections in registration order with their control ranges', () => {
    const reg = createLookRegistry();
    reg.section('a', { x: 1 }, { x: [0, 2, 0.1] });
    reg.section('b', { y: false });
    expect(reg.sections().map((s) => s.name)).toEqual(['a', 'b']);
    expect(reg.sections()[0]?.ranges).toEqual({ x: [0, 2, 0.1] });
  });

  it('refuses two sections with one name', () => {
    const reg = createLookRegistry();
    reg.section('camera', { fov: 57 });
    expect(() => reg.section('camera', { fov: 60 })).toThrow(/camera/);
  });
});

describe('look', () => {
  it('holds the post and light starting values from the spec', () => {
    expect(look.post.bloomThreshold).toBe(1.0);
    expect(look.post.bloomStrength).toBe(0.45);
    expect(look.renderer.maxPixelRatio).toBe(2);
    expect(look.renderer.msaaSamples).toBe(4);
    expect(look.lights.keyElevationDeg).toBeGreaterThanOrEqual(55);
    expect(look.lights.keyElevationDeg).toBeLessThanOrEqual(60);
    expect(look.lights.poolSlots).toBe(4);
  });

  it('registers every section with the panel registry', () => {
    const names = lookSections().map((s) => s.name);
    for (const name of Object.keys(look)) expect(names).toContain(name);
  });
});

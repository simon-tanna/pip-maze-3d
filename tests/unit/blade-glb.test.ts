import type { Box3, BufferGeometry, Mesh, Object3D } from 'three';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BLADE_SHAPE, HEAD_RING } from '@core/blade';
import { BLADE_MODEL, BLADE_NODES } from '@render/blade-kit';
import { CHAMBER_KIT, WALL_HEIGHT } from '@render/chamber-kit';
import { color } from '@render/palette';
import type { ColorName } from '@render/palette';
import { decodePng, modelBytes, parseModel, readGlb, triangles } from './support/glb';

let root: Object3D;

beforeAll(async () => {
  root = (await parseModel(BLADE_MODEL, { skipTextures: true })).scene;
});

const meshOf = (name: string): Mesh => {
  const node = root.getObjectByName(name);
  expect(node, name).toBeDefined();
  expect((node as Mesh).isMesh, `${name} is a mesh`).toBe(true);
  return node as Mesh;
};
const geometryOf = (name: string): BufferGeometry => meshOf(name).geometry;
const boundsOf = (name: string) => {
  const g = geometryOf(name);
  g.computeBoundingBox();
  return g.boundingBox as Box3;
};
const verticesOf = (name: string) => {
  const pos = geometryOf(name).getAttribute('position');
  return Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i));
};
const eps = 1e-4;
const { arm, halfThickness, pivotHeight } = BLADE_SHAPE;

describe('steel blade GLB', () => {
  it('has exactly the blade’s nodes, each modelled in place (identity transforms)', () => {
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        meshes.push(o.name);
        expect(o.matrix.equals(o.matrix.clone().identity()), `${o.name} transform`).toBe(true);
      }
    });
    expect(meshes.sort()).toEqual([...BLADE_NODES].sort());
  });

  it('extrudes the head from the outline JSON: same bounds, ±halfThickness', () => {
    const b = boundsOf('head');
    const xs = HEAD_RING.map(([x]) => x);
    const ys = HEAD_RING.map(([, y]) => y);
    expect(b.min.x).toBeCloseTo(Math.min(...xs), 4);
    expect(b.max.x).toBeCloseTo(Math.max(...xs), 4);
    expect(b.min.y).toBeCloseTo(Math.min(...ys), 4);
    expect(b.max.y).toBeCloseTo(Math.max(...ys), 4);
    expect(b.min.z).toBeCloseTo(-halfThickness, 4);
    expect(b.max.z).toBeCloseTo(halfThickness, 4);
    // Every outline point is on the head's silhouette, with the crescent's edge down.
    const vs = verticesOf('head');
    for (const [x, y] of HEAD_RING) {
      const near = Math.min(...vs.map((v) => Math.hypot(v.x - x, v.y - y)));
      expect(near, `ring point (${x}, ${y})`).toBeLessThan(eps);
    }
    expect(Math.min(...ys)).toBeLessThan(0);
  });

  it('runs the haft from the axle down into the head', () => {
    const b = boundsOf('haft');
    expect(b.max.y).toBeGreaterThan(0);
    expect(b.min.y).toBeLessThan(-arm + Math.max(...HEAD_RING.map(([, y]) => y)));
    expect(b.min.y).toBeGreaterThan(-arm);
  });

  it('sits two lintels on the wall tops, either side of the swing plane, with the axle between', () => {
    const [a, c] = ['lintel_0', 'lintel_1'].map(boundsOf) as [Box3, Box3];
    for (const b of [a, c]) {
      expect(b.min.y).toBeCloseTo(WALL_HEIGHT, 4);
      expect(b.max.y).toBeGreaterThan(pivotHeight);
      // Bridges the 2 m corridor onto both slotted wall tiles.
      expect(b.min.x).toBeLessThan(-1.2);
      expect(b.max.x).toBeGreaterThan(1.2);
    }
    expect(a.max.z).toBeLessThan(0);
    expect(c.min.z).toBeGreaterThan(0);
    // The spinning parts stay between the lintels, so the head clears them over the top.
    const spinning = Math.max(
      ...['head', 'haft'].map((n) => {
        const b = boundsOf(n);
        return Math.max(-b.min.z, b.max.z);
      }),
    );
    expect(spinning).toBeLessThan(Math.min(-a.max.z, c.min.z));
    const axle = boundsOf('axle');
    expect((axle.min.y + axle.max.y) / 2).toBeCloseTo(pivotHeight, 4);
    expect(axle.min.z).toBeLessThan(a.max.z);
    expect(axle.max.z).toBeGreaterThan(c.min.z);
  });

  it('fills the same texture slots as the chamber kit’s atlas, so it shares its program', () => {
    // A blade-free level 0 precompiles without blades; level 1's must not compile mid-play.
    const slots = (bytes: Buffer) => {
      const { json } = readGlb(bytes);
      return json.materials.map((m) => ({
        base: m.pbrMetallicRoughness?.baseColorTexture !== undefined,
        orm: m.pbrMetallicRoughness?.metallicRoughnessTexture !== undefined,
        ao: m.occlusionTexture !== undefined,
        normal: m.normalTexture !== undefined,
        doubleSided: m.doubleSided ?? false,
      }));
    };
    const [atlas] = slots(modelBytes(CHAMBER_KIT)).filter((m) => m.base);
    const blade = slots(modelBytes(BLADE_MODEL));
    expect(blade).toHaveLength(2);
    for (const m of blade) expect(m).toEqual(atlas);
  });

  it('shades the steel metal 1, roughness 0.3–0.45, STEEL_LIGHT base; the lintels in STONE_DARK', () => {
    const { json, textureImage } = readGlb(modelBytes(BLADE_MODEL));
    const materialOf = (name: string) => {
      const primitives = json.meshes.find((m) => m.name === name)?.primitives ?? [];
      expect(primitives.length, name).toBe(1);
      return primitives[0]?.material ?? -1;
    };
    const steel = materialOf('head');
    expect(materialOf('haft')).toBe(steel);
    expect(materialOf('axle')).toBe(steel);
    const stone = materialOf('lintel_0');
    expect(materialOf('lintel_1')).toBe(stone);
    expect(stone).not.toBe(steel);

    type Pbr = { metallicFactor?: number; roughnessFactor?: number };
    const sample = (mat: number, nodes: string[]) => {
      const pbr = (json.materials[mat]?.pbrMetallicRoughness ?? {}) as Pbr &
        NonNullable<(typeof json.materials)[number]['pbrMetallicRoughness']>;
      const base = decodePng(textureImage(pbr.baseColorTexture?.index ?? -1));
      const orm = decodePng(textureImage(pbr.metallicRoughnessTexture?.index ?? -1));
      const at = (img: typeof base, { x: u, y: v }: Vector3) => {
        const x = Math.min(img.width - 1, Math.floor(u * img.width));
        const y = Math.min(img.height - 1, Math.floor(v * img.height));
        return Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
      };
      const out = { base: [] as number[][], orm: [] as number[][], pbr };
      const uv = new Vector3();
      for (const n of nodes) {
        for (const t of triangles(geometryOf(n))) {
          if (t.world.getArea() < 1e-4) continue;
          t.uv.getMidpoint(uv);
          out.base.push(at(base, uv));
          out.orm.push(at(orm, uv));
        }
      }
      return out;
    };

    const s = sample(steel, ['head', 'haft', 'axle']);
    expect(s.pbr.metallicFactor ?? 1).toBe(1);
    expect(s.pbr.roughnessFactor ?? 1).toBe(1);
    for (const [, g = 0, b = 0] of s.orm) {
      expect(b, 'steel metal').toBeGreaterThan(250);
      expect(g / 255).toBeGreaterThanOrEqual(0.3 - 0.01);
      expect(g / 255).toBeLessThanOrEqual(0.45 + 0.01);
    }
    const st = sample(stone, ['lintel_0', 'lintel_1']);
    for (const [, , b = 0] of st.orm) expect(b, 'stone metal').toBeLessThan(5);

    // Mean base colour (sRGB bytes) is nearest its palette base among the candidates.
    const mean = (px: number[][]) =>
      [0, 1, 2].map((k) => px.reduce((a, p) => a + (p[k] ?? 0), 0) / px.length);
    const srgb = (name: ColorName) => {
      const c = color(name).clone().convertLinearToSRGB();
      return [c.r * 255, c.g * 255, c.b * 255];
    };
    const nearest = (px: number[][], names: ColorName[]) => {
      const m = mean(px);
      const d = (n: ColorName) => srgb(n).reduce((a, v, k) => a + (v - (m[k] ?? 0)) ** 2, 0);
      return [...names].sort((p, q) => d(p) - d(q))[0];
    };
    expect(nearest(s.base, ['STEEL_LIGHT', 'STEEL', 'STEEL_DARK'])).toBe('STEEL_LIGHT');
    expect(nearest(st.base, ['STONE_DARK', 'STONE_SIDE', 'STONE', 'SHADOW'])).toBe('STONE_DARK');
  });
});

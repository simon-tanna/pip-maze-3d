import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import type { Box3, BufferGeometry, Mesh, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { BLADE_SHAPE, HEAD_RING } from '@core/blade';
import { TILE_SIZE } from '@core/grid';
import { CHAMBER_KIT, KIT_NODES, LIP_BOTTOM, LIP_REACH, WALL_HEIGHT } from '@render/chamber-kit';
import { decodePng, pngSize, readGlb, triangles } from './glb';

const glb = fileURLToPath(new URL(`../../public/models/${CHAMBER_KIT}.glb`, import.meta.url));
let root: Object3D;

const ATLAS_PX = 2048;
const TEXELS_PER_M = 128;

beforeAll(async () => {
  const bytes = readFileSync(glb);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  // Node has no image decoder: skip textures here (the atlas tests read the GLB directly).
  const loader = new GLTFLoader().register(() => ({
    name: 'skip-textures',
    loadTexture: () => Promise.resolve(null as unknown as Texture),
  }));
  root = (await loader.parseAsync(buffer, '')).scene;
});

const geometryOf = (name: string): BufferGeometry => {
  const node = root.getObjectByName(name);
  expect(node, name).toBeDefined();
  expect((node as Mesh).isMesh, `${name} is a mesh`).toBe(true);
  return (node as Mesh).geometry;
};
const boundsOf = (name: string) => {
  const g = geometryOf(name);
  g.computeBoundingBox();
  return g.boundingBox as Box3;
};
const verticesOf = (name: string): [number, number, number][] => {
  const pos = geometryOf(name).getAttribute('position');
  return Array.from({ length: pos.count }, (_, i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
};
const half = TILE_SIZE / 2;
const eps = 1e-4;
const FACES = ['face_0', 'face_1', 'face_2', 'face_slot'];

describe('sandstone chamber kit', () => {
  it('has exactly the sandstone kit’s node names', () => {
    expect(KIT_NODES).toEqual([
      'cap_0',
      'cap_1',
      'cap_2',
      'cap_slot',
      'face_0',
      'face_1',
      'face_2',
      'face_slot',
      'floor_0',
      'floor_1',
      'floor_2',
      'floor_3',
      'floor_4',
      'contact',
    ]);
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o.name);
    });
    expect(meshes.sort()).toEqual([...KIT_NODES].sort());
  });

  it('caps a tile at the 2.2 m wall height', () => {
    expect(WALL_HEIGHT).toBe(2.2);
    for (const name of ['cap_0', 'cap_1', 'cap_2', 'cap_slot']) {
      const b = boundsOf(name);
      expect(b.max.y, name).toBeCloseTo(WALL_HEIGHT, 4);
      expect(b.min.x).toBeCloseTo(-half, 4);
      expect(b.max.x).toBeCloseTo(half, 4);
      expect(b.min.z).toBeCloseTo(-half, 4);
      expect(b.max.z).toBeCloseTo(half, 4);
    }
  });

  it('models faces on the tile’s south edge (+z), inside the tile, floor to cap', () => {
    for (const name of FACES) {
      const b = boundsOf(name);
      expect(b.min.y, name).toBeCloseTo(0, 4);
      expect(b.max.y).toBeLessThanOrEqual(WALL_HEIGHT + eps);
      expect(b.min.z).toBeGreaterThan(0);
      // Below the cap lip, the relief stays inside the wall tile.
      for (const [x, y, z] of verticesOf(name)) {
        if (y < LIP_BOTTOM - eps)
          expect(z, `${name} relief at y ${y}`).toBeLessThanOrEqual(half + eps);
        expect(Math.abs(x), name).toBeLessThanOrEqual(half + LIP_REACH + eps);
      }
    }
  });

  it('carries a cap lip of at most 5 cm, mitred at 45° so outer corners close', () => {
    for (const name of FACES) {
      const over = verticesOf(name).filter(([, , z]) => z > half + eps);
      expect(over.length, `${name} has a lip`).toBeGreaterThan(0);
      for (const [x, y, z] of over) {
        expect(y, name).toBeGreaterThanOrEqual(LIP_BOTTOM - eps);
        expect(z - half, name).toBeLessThanOrEqual(LIP_REACH + eps);
        // Past the tile's east or west edge, the lip stays inside the 45° mitre line.
        expect(Math.abs(x) - half, name).toBeLessThanOrEqual(z - half + eps);
      }
    }
    // An unslotted face's lip runs edge to edge and reaches both mitred corners.
    const b = boundsOf('face_0');
    expect(b.max.z).toBeCloseTo(half + LIP_REACH, 4);
    expect(b.min.x).toBeCloseTo(-half - LIP_REACH, 4);
    expect(b.max.x).toBeCloseTo(half + LIP_REACH, 4);
  });

  it('cuts cap_slot and face_slot clear of the blade’s swing plane, wherever it reaches', () => {
    // The head's farthest point from the pivot, in the swing plane (u, y).
    const reach = Math.max(...HEAD_RING.map(([u, y]) => Math.hypot(u, y - BLADE_SHAPE.arm)));
    // From the blade tile's centre the swing reaches into the slotted wall tile, never past it.
    expect(reach).toBeGreaterThan(half);
    expect(reach).toBeLessThan(3 * half);
    // Every triangle stays outside the slot band around local x = 0 (the swing plane),
    // over the whole tile depth, through the face and the cap alike.
    const clear = BLADE_SHAPE.halfThickness + 0.05;
    for (const name of ['cap_slot', 'face_slot']) {
      const g = geometryOf(name);
      const pos = g.getAttribute('position');
      const index = g.getIndex();
      const n = index ? index.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        const xs = [0, 1, 2].map((k) => pos.getX(index ? index.getX(t + k) : t + k));
        const straddles = Math.min(...xs) < clear - eps && Math.max(...xs) > -clear + eps;
        expect(straddles, `${name} triangle ${t / 3} crosses the slot`).toBe(false);
      }
    }
  });

  it('shades every tile piece with one atlas material: base colour, baked AO (ORM) and normal', () => {
    const { json, textureImage } = readGlb(readFileSync(glb));
    const materialOf = (name: string) => {
      const primitives = json.meshes.find((m) => m.name === name)?.primitives ?? [];
      expect(primitives.length, name).toBe(1);
      return primitives[0]?.material;
    };
    const [atlas, ...others] = new Set(KIT_NODES.filter((n) => n !== 'contact').map(materialOf));
    expect(others).toEqual([]);
    expect(materialOf('contact')).not.toBe(atlas);
    const mat = json.materials[atlas ?? -1] ?? {};
    const pbr = mat.pbrMetallicRoughness ?? {};
    expect(mat.doubleSided ?? false).toBe(false);
    const slots = [
      pbr.baseColorTexture,
      pbr.metallicRoughnessTexture,
      mat.occlusionTexture,
      mat.normalTexture,
    ];
    for (const slot of slots) {
      expect(slot).toBeDefined();
      expect(pngSize(textureImage(slot?.index ?? -1))).toEqual({
        width: ATLAS_PX,
        height: ATLAS_PX,
      });
    }
    // AO is packed into the ORM image's red channel.
    expect(mat.occlusionTexture?.index).toBe(pbr.metallicRoughnessTexture?.index);
  });

  it('maps every tile piece into the atlas at 128 px/m', () => {
    for (const name of KIT_NODES.filter((n) => n !== 'contact')) {
      let world = 0;
      let texels = 0;
      for (const t of triangles(geometryOf(name))) {
        world += t.world.getArea();
        texels += t.uv.getArea() * ATLAS_PX ** 2;
        for (const p of [t.uv.a, t.uv.b, t.uv.c]) {
          expect(Math.min(p.x, p.y), `${name} uv`).toBeGreaterThanOrEqual(0);
          expect(Math.max(p.x, p.y), `${name} uv`).toBeLessThanOrEqual(1);
        }
      }
      const density = Math.sqrt(texels / world);
      expect(density, `${name} px/m`).toBeGreaterThan(TEXELS_PER_M * 0.95);
      expect(density, `${name} px/m`).toBeLessThan(TEXELS_PER_M * 1.05);
    }
  });

  it('bakes the floor as the darkest, lowest-contrast surface (ADR 0001)', () => {
    const { json, textureImage } = readGlb(readFileSync(glb));
    const atlas = json.meshes.find((m) => m.name === 'floor_0')?.primitives[0]?.material ?? -1;
    const base = json.materials[atlas]?.pbrMetallicRoughness?.baseColorTexture?.index ?? -1;
    const img = decodePng(textureImage(base));
    const linear = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ({ x: u, y: v }: Vector3) => {
      const x = Math.min(img.width - 1, Math.floor(u * img.width));
      const y = Math.min(img.height - 1, Math.floor(v * img.height));
      const [r = 0, g = 0, b = 0] = img.data.subarray((y * img.width + x) * 4);
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const samples = [
      [1 / 3, 1 / 3],
      [0.6, 0.2],
      [0.2, 0.6],
      [0.2, 0.2],
    ];
    const normal = new Vector3();
    const uv = new Vector3();
    /** Area-weighted luminance mean and relative spread over what the north chase camera
     * sees of a piece: tops (+y) and south-looking sides (+z). */
    const stats = (name: string) => {
      let w = 0;
      let sum = 0;
      let sq = 0;
      for (const t of triangles(geometryOf(name))) {
        t.world.getNormal(normal);
        if (Math.max(normal.y, normal.z) < 0.7) continue;
        const area = t.world.getArea();
        for (const [a = 0, b = 0] of samples) {
          uv.set(0, 0, 0)
            .addScaledVector(t.uv.a, 1 - a - b)
            .addScaledVector(t.uv.b, a)
            .addScaledVector(t.uv.c, b);
          const l = luminance(uv);
          w += area;
          sum += l * area;
          sq += l * l * area;
        }
      }
      const mean = sum / w;
      return { mean, spread: Math.sqrt(sq / w - mean * mean) / mean };
    };
    const floors = KIT_NODES.filter((n) => n.startsWith('floor_')).map(stats);
    const walls = KIT_NODES.filter((n) => n.startsWith('cap_') || n.startsWith('face_')).map(stats);
    expect(Math.max(...floors.map((s) => s.mean))).toBeLessThan(
      Math.min(...walls.map((s) => s.mean)),
    );
    expect(Math.max(...floors.map((s) => s.spread))).toBeLessThan(
      Math.min(...walls.map((s) => s.spread)),
    );
  });

  it('lays flagstones flat over the whole tile at floor level', () => {
    for (let v = 0; v < 5; v++) {
      const b = boundsOf(`floor_${v}`);
      expect(b.max.y, `floor_${v}`).toBeCloseTo(0, 2);
      expect(b.max.x - b.min.x).toBeCloseTo(TILE_SIZE, 4);
      expect(b.max.z - b.min.z).toBeCloseTo(TILE_SIZE, 4);
    }
  });

  it('shapes the contact strip as a 1 m reach behind its wall edge, v = 0 at the wall', () => {
    const g = geometryOf('contact');
    const b = boundsOf('contact');
    expect(b.max.z).toBeCloseTo(0, 4);
    expect(b.min.z).toBeCloseTo(-1, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(TILE_SIZE, 4);
    expect(b.min.y).toBeGreaterThan(0);
    expect(b.max.y).toBeLessThan(0.05);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getY(i)).toBeCloseTo(-pos.getZ(i), 4);
    }
  });
});

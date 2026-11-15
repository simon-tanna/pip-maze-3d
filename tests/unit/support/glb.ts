import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Triangle, Vector3 } from 'three';
import type { BufferGeometry, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/** The bytes of a committed `public/models/<name>.glb`. */
export function modelBytes(name: string): Buffer<ArrayBuffer> {
  return readFileSync(
    fileURLToPath(new URL(`../../../public/models/${name}.glb`, import.meta.url)),
  );
}

export interface ParseOptions {
  /**
   * Resolve every texture to null instead of decoding it. Node has no image decoder, so a
   * textured GLB (the chamber kit) needs this; read its images with `readGlb` instead.
   */
  skipTextures?: boolean;
}

/** Parse a committed `public/models/<name>.glb` in Node. */
export async function parseModel(name: string, options: ParseOptions = {}): Promise<GLTF> {
  const bytes = modelBytes(name);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loader = new GLTFLoader();
  if (options.skipTextures) {
    loader.register(() => ({
      name: 'skip-textures',
      loadTexture: () => Promise.resolve(null as unknown as Texture),
    }));
  }
  return loader.parseAsync(buffer, '');
}

/**
 * Helpers for what GLTFLoader can't show in Node (it has no image decoder): a GLB's
 * JSON and binary chunks, its embedded PNGs, and a geometry's triangles with their UVs.
 */

export interface GlbMaterial {
  doubleSided?: boolean;
  normalTexture?: { index: number };
  occlusionTexture?: { index: number };
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
}

export interface Glb {
  json: {
    materials: GlbMaterial[];
    meshes: { name: string; primitives: { material: number }[] }[];
  };
  /** The PNG bytes behind a glTF texture index. */
  textureImage(texture: number): Buffer;
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`GLB has no ${what}`);
  return value;
}

export function readGlb(bytes: Buffer): Glb {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Glb['json'] & {
    textures: { source: number }[];
    images: { bufferView: number }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
  };
  const binStart = 20 + jsonLength + 8;
  const bin = bytes.subarray(binStart, binStart + bytes.readUInt32LE(20 + jsonLength));
  return {
    json,
    textureImage(texture) {
      const source = must(json.textures[texture], `texture ${texture}`).source;
      const image = must(json.images[source], `image ${source}`);
      const view = must(json.bufferViews[image.bufferView], `bufferView ${image.bufferView}`);
      const at = view.byteOffset ?? 0;
      return bin.subarray(at, at + view.byteLength);
    },
  };
}

/** Width and height from a PNG's IHDR chunk. */
export const pngSize = (png: Buffer) => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

export interface Rgba {
  width: number;
  height: number;
  /** RGBA bytes, row 0 at the top. */
  data: Uint8Array;
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG (what Blender writes). */
export function decodePng(png: Buffer): Rgba {
  const { width, height } = pngSize(png);
  const [depth, type, , , interlace] = png.subarray(24, 29);
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth}, type ${type}, interlace ${interlace}`);
  }
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') {
      idat.push(png.subarray(at + 8, at + 8 + length));
    }
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const px = new Uint8Array(stride * height);
  const get = (i: number) => px[i] ?? 0;
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    const filter = raw[row] ?? 0;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? get(y * stride + x - bpp) : 0;
      const b = y > 0 ? get((y - 1) * stride + x) : 0;
      const c = x >= bpp && y > 0 ? get((y - 1) * stride + x - bpp) : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      px[y * stride + x] = ((raw[row + 1 + x] ?? 0) + predictor) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = get(i * bpp + k);
    data[i * 4 + 3] = bpp === 4 ? get(i * bpp + 3) : 255;
  }
  return { width, height, data };
}

export interface Tri {
  /** Positions, in the geometry's local frame. */
  readonly world: Triangle;
  /** UVs as (u, v, 0). */
  readonly uv: Triangle;
}

/** Every triangle of an indexed or non-indexed geometry, with its UVs. */
export function* triangles(g: BufferGeometry): Generator<Tri> {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const index = g.getIndex();
  const n = index ? index.count : pos.count;
  const at = (k: number) => (index ? index.getX(k) : k);
  const p = (i: number) => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  const t = (i: number) => new Vector3(uv.getX(i), uv.getY(i), 0);
  for (let k = 0; k < n; k += 3) {
    const [a, b, c] = [at(k), at(k + 1), at(k + 2)];
    yield { world: new Triangle(p(a), p(b), p(c)), uv: new Triangle(t(a), t(b), t(c)) };
  }
}

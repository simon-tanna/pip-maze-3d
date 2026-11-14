import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/** Parse a committed `public/models/<name>.glb` in Node (texture-less GLBs only). */
export async function parseModel(name: string): Promise<GLTF> {
  const bytes = readFileSync(
    fileURLToPath(new URL(`../../../public/models/${name}.glb`, import.meta.url)),
  );
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(buffer, '');
}

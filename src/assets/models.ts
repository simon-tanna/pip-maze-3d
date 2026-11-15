import type { AnimationClip, BufferGeometry, Material, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

function parse(name: string): Promise<GLTF> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    cache.set(name, pending);
  }
  return pending;
}

/**
 * Load a Blender-exported model from public/models/<name>.glb (e.g. "hazards/flame").
 * Each call returns a fresh clone; the parsed glTF is cached per name. Shadow flags are
 * left as exported: each view sets its own.
 * Skinned models go through `loadCharacter` instead.
 */
export async function loadModel(name: string): Promise<Object3D> {
  return (await parse(name)).scene.clone(true);
}

/** A rigged character instance: its own skeleton, and the clips every instance shares. */
export interface Character {
  /** A `SkeletonUtils.clone`: its skinned meshes bind to its own bones. */
  root: Object3D;
  /** Shared and immutable; give each instance its own `AnimationMixer(root)`. */
  clips: readonly AnimationClip[];
}

/** One character instance from a parsed glTF (`loadCharacter` without the fetch). */
export function instantiateCharacter(gltf: GLTF): Character {
  return { root: cloneSkinned(gltf.scene), clips: gltf.animations };
}

/**
 * Load a rigged character from public/models/<name>.glb (e.g. "characters/pip"). The parse
 * is cached per name; each call returns a fresh instance. `Object3D.clone` would leave a
 * clone's skinned meshes bound to the cached original's bones, so this uses
 * `SkeletonUtils.clone`. Shadow flags are left as exported: the view sets its own.
 */
export async function loadCharacter(name: string): Promise<Character> {
  return instantiateCharacter(await parse(name));
}

/** One node's mesh data, shared (not cloned): build InstancedMeshes from it. */
export interface GltfNode {
  geometry: BufferGeometry;
  material: Material;
}

export interface Gltf {
  /** The named node's geometry and material. Throws if the node is missing or not one mesh. */
  getNode(name: string): GltfNode;
}

/**
 * A parsed glTF as a kit of named nodes (`loadGltf` without the fetch). `name` labels the
 * errors. Every caller shares the scene's geometries and materials.
 */
export function gltfKit(gltf: GLTF, name: string): Gltf {
  const root = gltf.scene;
  return {
    getNode(node) {
      const found = root.getObjectByName(node);
      if (!found) throw new Error(`${name}.glb has no node "${node}"`);
      const meshes: Mesh[] = [];
      found.traverse((o) => {
        if ((o as Mesh).isMesh) meshes.push(o as Mesh);
      });
      const [mesh] = meshes;
      if (!mesh || meshes.length > 1 || Array.isArray(mesh.material)) {
        throw new Error(`${name}.glb node "${node}" must be exactly one single-material mesh`);
      }
      return { geometry: mesh.geometry, material: mesh.material as Material };
    },
  };
}

/**
 * Load public/models/<name>.glb as a kit of named nodes, for instancing. The parse is
 * cached per name, and every caller shares the same geometries and materials, so don't
 * dispose them per level.
 */
export async function loadGltf(name: string): Promise<Gltf> {
  return gltfKit(await parse(name), name);
}

import type { BufferGeometry, Material, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();

function parse(name: string): Promise<Object3D> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
      .then((g) => g.scene);
    cache.set(name, pending);
  }
  return pending;
}

/**
 * Load a Blender-exported model from public/models/<name>.glb (e.g. "characters/pip").
 * Each call returns a fresh clone; the parsed glTF is cached per name. Shadow flags are
 * left as exported: each view sets its own.
 * For skinned/animated models use SkeletonUtils.clone instead of Object3D.clone.
 */
export async function loadModel(name: string): Promise<Object3D> {
  return (await parse(name)).clone(true);
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
 * Load public/models/<name>.glb as a kit of named nodes, for instancing. The parse is
 * cached per name, and every caller shares the same geometries and materials, so don't
 * dispose them per level.
 */
export async function loadGltf(name: string): Promise<Gltf> {
  const root = await parse(name);
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

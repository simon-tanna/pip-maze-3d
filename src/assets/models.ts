import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();

/**
 * Load a Blender-exported model from public/models/<name>.glb (e.g. "placeholders/wall").
 * Each call returns a fresh clone; the parsed glTF is cached per name.
 * For skinned/animated models use SkeletonUtils.clone instead of Object3D.clone.
 */
export async function loadModel(name: string): Promise<Object3D> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
      .then((g) => g.scene);
    cache.set(name, pending);
  }
  const source = await pending;
  const copy = source.clone(true);
  copy.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return copy;
}

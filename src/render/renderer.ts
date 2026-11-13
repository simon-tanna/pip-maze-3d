import {
  HalfFloatType,
  NeutralToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { IUniform, PerspectiveCamera, Scene } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { look } from './look';

/**
 * The canvas and its post chain (ADR 0001): NeutralToneMapping, DPR capped by look,
 * EffectComposer on a multisampled HalfFloat target (the canvas has no AA of its own)
 * → bloom → vignette → OutputPass (tone mapping + sRGB).
 */
export interface GameRenderer {
  renderer: WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  vignette: ShaderPass;
  /** Apply the current look values, then draw one frame through the post chain. */
  render(): void;
}

export function createRenderer(
  container: HTMLElement,
  scene: Scene,
  camera: PerspectiveCamera,
): GameRenderer {
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, look.renderer.maxPixelRatio));
  container.appendChild(renderer.domElement);

  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: look.renderer.msaaSamples,
  });
  target.texture.name = 'EffectComposer.rt1';
  const composer = new EffectComposer(renderer, target);

  const p = look.post;
  const bloom = new UnrealBloomPass(
    new Vector2(1, 1),
    p.bloomStrength,
    p.bloomRadius,
    p.bloomThreshold,
  );
  const vignette = new ShaderPass(VignetteShader);
  const vignetteUniforms = vignette.uniforms as {
    offset: IUniform<number>;
    darkness: IUniform<number>;
  };
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    const dpr = Math.min(window.devicePixelRatio, look.renderer.maxPixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  return {
    renderer,
    composer,
    bloom,
    vignette,
    render() {
      renderer.toneMappingExposure = look.renderer.exposure;
      bloom.enabled = p.bloom;
      bloom.threshold = p.bloomThreshold;
      bloom.strength = p.bloomStrength;
      bloom.radius = p.bloomRadius;
      vignette.enabled = p.vignette;
      vignetteUniforms.offset.value = p.vignetteOffset;
      vignetteUniforms.darkness.value = p.vignetteDarkness;
      composer.render();
    },
  };
}

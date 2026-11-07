# What does Torchlit Sandstone look like in 3D?

Type: grilling
Status: resolved
Blocked by:

## Question

Which visual style does the 3D game commit to? Options include flat-shaded low-poly, stylised with hand-painted or pixel textures, and PBR-ish. How do v2's palette `P` / `LIGHT` (30 named colours) translate: vertex colours, textures, material colours? What is the lighting mood: hero torch, flame light, ambient level, key light from the top-left? What is the resolution and post-processing stance (pixelated render target, outline pass, vignette)? The answer decides how `src/render/palette.ts` is shaped and what the Blender kit pieces look like.

## Answer

**Stylised PBR.** Real PBR shading (`MeshStandardMaterial`, metal and roughness, normal maps) on chunky, exaggerated forms that read from the camera chosen in 01 (about 120 px per tile at 1080p). Not pixel textures, not flat-shaded, not grounded realism. Silhouette and value contrast carry readability.

### Palette

- **Authoring palette, not output palette.** Every material input (base colour, texels, emissive, light colours) comes from `P` / `LIGHT`. Lit, tone-mapped pixels may leave the palette.
- **One source shared by both runtimes.** `src/render/palette.json` (`"STONE": "#8f6a4c"` plus a `LIGHT` block) is canonical. `src/render/palette.ts` imports it and exposes frozen `P` / `LIGHT`, `color(name)` → `THREE.Color` (sRGB → linear via ColorManagement), and `css(name)` for the DOM HUD. `blender/scripts/lib/palette.py` reads the same JSON and returns linear RGB for Principled BSDF inputs. No hex anywhere else, in TS or Python.
- **Ramps become surface variation, not shading.** v2 painted lighting into its ramps (top/side/shadow). In 3D the lights do that, so ramps supply block-to-block tone, mortar and wear.
- **v2's readability rules are binding:** hero > hazards > pickups > decor > floor; fire ramp only for hazards and telegraphs; gold only for pickups; curse teal only for mummies; steel only for blades and spikes; floor the darkest, lowest-contrast surface.
- **One fire exception:** a flame carried by the hero (if the hero ticket gives the hero a torch prop) may use `FIRE_HOT` / `FIRE_CORE` only, never the `EMBER` reds, kept small and always attached to the hero.
- Scene background `INK`, no fog.

### Material classes (starting values, tuned later)

| Class          | Base colour (from `P`)                                                 | Roughness | Metal | Emissive                          |
| -------------- | ---------------------------------------------------------------------- | --------- | ----- | --------------------------------- |
| Sandstone wall | `STONE_SIDE`…`STONE_LIGHT` per block, `STONE_DARK` mortar, `SAND` wear | 0.85–0.95 | 0     | –                                 |
| Floor          | `FLOOR_DARK`…`FLOOR_LIGHT`                                             | 0.9       | 0     | –                                 |
| Moss / bone    | `MOSS` ramp / `BONE`                                                   | 0.7–1.0   | 0     | –                                 |
| Linen (mummy)  | `LINEN` ramp                                                           | 1.0       | 0     | –                                 |
| Steel          | **`STEEL_LIGHT`** base, `STEEL` / `STEEL_DARK` wear                    | 0.3–0.45  | 1     | –                                 |
| Gold           | `GOLD` / `GOLD_LIGHT`                                                  | 0.25–0.35 | 1     | subtle `GOLD_LIGHT`               |
| Fire           | –                                                                      | –         | 0     | `FIRE`…`FIRE_CORE`, intensity ≥ 2 |
| Curse          | `CURSE_DARK`                                                           | –         | 0     | `CURSE`, intensity ≥ 2            |

Steel uses the light end of its ramp because a PBR metal's base colour is its reflectance. `STEEL` (about 21% linear) would render dull and dark.

### Asset source

- **bpy-procedural by default:** Principled BSDF node setups with palette colour inputs, baked in Blender to texture sets (base colour, ORM, normal), with **AO baked in**, exported through `export_glb`.
- CC0 / scanned maps are allowed for **greyscale detail only** (normal, roughness, AO), never colour.
- Hand-authored `.blend` pieces can replace any procedural piece later through the same export path.
- **Texel density 128 px/m** (256² per 2 m tile face), mipmapped, maximum anisotropy.

### Lighting mood

- **v2 parity:** the whole visible chamber reads. The torch adds warmth and focus, never visibility, so darkness never decides whether a hazard is fair.
- **Key light:** the single shadowed DirectionalLight comes from the **north-west** (screen top-left with the north-facing camera from 01), elevation about **55–60°**, fixed for every chamber. Wall tops are brightest, camera-facing south faces sit in mid-shade (v2's `STONE` > `STONE_SIDE`), and shadows fall down and right on screen.
- **Fill:** HemisphereLight (from 03) plus a **palette gradient environment map**: a small PMREM'd dome of `LIGHT.AMBIENT` above and `FLOOR_DARK` below, low `envMapIntensity`, generated once at startup and never toggled, so steel and gold read as metal.
- **Hero torch:** the unshadowed PointLight from 03 sits slightly in front of the hero (south, toward the camera) to fill the side the key light leaves in shade.
- **Hero rim:** a cheap fresnel edge term in the hero material, tinted `CREAM`. No extra light.
- **Pickups get no real lights.** Keys, coins and the chest glow through subtle `GOLD_LIGHT` emissive, bloom and an additive floor glow decal. Real lights in every chamber are fixed at 1 key + 1 hemisphere fill + 1 torch + 4 flame-pool slots.

### Renderer and post

- **Tone mapping: `NeutralToneMapping`** (replaces the scaffold's ACES Filmic), so palette base colours, especially the reserved fire, gold and teal, stay close to their hex values.
- **Chain:** `EffectComposer` with an MSAA render target → `UnrealBloomPass` (high threshold: only emissive at intensity ≥ 2 blooms, and lit surfaces are tuned to stay below it) → subtle vignette → `OutputPass`.
- No SSAO/GTAO (AO is baked), no outline pass, no pixelated render target. Native resolution, DPR capped at 2. The HUD is DOM, so post never touches it.

### Tuning

All feel values (key, hemisphere, environment and torch intensities; bloom strength and threshold; vignette; the material numbers above) live as named starting values in **`src/render/look.ts`**, with a dev-only lil-gui panel stripped from production builds. The human tunes them in the real slice chamber. There is no separate look-dev ticket.

**Rejected:** flat-shaded low-poly, low-res pixel textures, hand-painted textures, grounded-realism PBR, CC0 colour maps, ACES/AgX tone mapping, `RoomEnvironment`, per-pickup PointLights, a strict output palette (toon quantisation).

import { Color } from 'three';
import raw from './palette.json';

/**
 * Torchlit Sandstone, the authoring palette (ADR 0001). `palette.json` is the single
 * source for every colour in TS and bpy; never write a colour literal anywhere else.
 */
type PaletteName = keyof typeof raw.P;
type LightName = keyof typeof raw.LIGHT;
/** Any name `color()` / `css()` accept: a `P` colour or a `LIGHT` colour. */
export type ColorName = PaletteName | LightName;

const HEX = /^#[0-9a-f]{6}$/;

function resolve(value: string, where: string): string {
  const hex = HEX.test(value) ? value : (raw.P as Record<string, string>)[value];
  if (!hex || !HEX.test(hex))
    throw new Error(`palette.json: ${where} = "${value}" is not a hex or P name`);
  return hex;
}

function freezeBlock<K extends string>(
  block: Record<K, string>,
  name: string,
): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(block) as K[]) out[key] = resolve(block[key], `${name}.${key}`);
  return Object.freeze(out);
}

/** Palette colours as sRGB `#rrggbb`. */
export const P = freezeBlock(raw.P, 'P');
/** Light colours as sRGB `#rrggbb` (entries in the JSON may name a `P` colour). */
export const LIGHT = freezeBlock(raw.LIGHT, 'LIGHT');

function hexOf(name: ColorName): string {
  const hex = (P as Record<string, string>)[name] ?? (LIGHT as Record<string, string>)[name];
  if (!hex) throw new Error(`Unknown palette colour "${name}"`);
  return hex;
}

/**
 * A new `THREE.Color` for `name`, converted sRGB → linear by ColorManagement.
 * `P` names win over `LIGHT` names where both exist (`GOLD`, `CURSE`).
 */
export function color(name: ColorName): Color {
  return new Color(hexOf(name));
}

/** `#rrggbb` for the DOM HUD and CSS. */
export function css(name: ColorName): string {
  return hexOf(name);
}

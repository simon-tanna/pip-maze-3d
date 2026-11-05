# Doom Maze 3D

A third-person 3D translation of **Pip's Temple Adventure** ([`../pip-maze-v-2`](../pip-maze-v-2)), built with three.js, Vite and TypeScript, with assets from Blender.

> Status: scaffold only. The placeholder scene shows a capsule "hero" and a Blender-exported wall.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
git lfs install
```

Blender 5.2 LTS (`brew install --cask blender`) is needed only for the `assets:*` scripts.

## Commands

| Command                    | What it does                                                         |
| -------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                 | Dev server at http://localhost:5180                                  |
| `pnpm build`               | Type-check + production build to `dist/`                             |
| `pnpm check`               | typecheck + lint + format check + unit tests                         |
| `pnpm test:e2e`            | Playwright smoke test (starts the dev server)                        |
| `pnpm assets:placeholders` | Build placeholder wall/floor .glb files with bpy                     |
| `pnpm assets:export`       | Export every `blender/source/**/*.blend` to `public/models/**/*.glb` |

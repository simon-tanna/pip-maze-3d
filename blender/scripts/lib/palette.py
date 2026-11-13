"""Torchlit Sandstone for bpy: reads src/render/palette.json, the only place a colour lives.

Returns linear RGB for Principled BSDF inputs (palette.json is sRGB hex). Mirrors
src/render/palette.ts: LIGHT entries may name a P colour, and P names win where both exist.
Pure Python (no bpy), so `python3 blender/scripts/lib/palette.py` dumps the linear values
that tests/unit/palette.test.ts checks against three.js.
"""

import json
import re
from pathlib import Path

PALETTE_JSON = Path(__file__).resolve().parents[3] / "src" / "render" / "palette.json"
_HEX = re.compile(r"^#[0-9a-f]{6}$")


def _load() -> dict[str, str]:
    raw = json.loads(PALETTE_JSON.read_text(encoding="utf-8"))
    p: dict[str, str] = raw["P"]
    merged: dict[str, str] = {}
    for key, value in raw["LIGHT"].items():
        merged[key] = value if _HEX.match(value) else p[value]
    merged.update(p)
    for key, value in merged.items():
        if not _HEX.match(value):
            raise ValueError(f"palette.json: {key} = {value!r} is not a hex colour")
    return merged


_COLOURS = _load()


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(name: str) -> tuple[float, float, float]:
    """Linear RGB for a P or LIGHT colour name."""
    h = _COLOURS[name]
    r, g, b = (_srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (1, 3, 5))
    return (r, g, b)


def rgba(name: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Linear RGBA, the shape Principled BSDF colour inputs take."""
    return (*rgb(name), alpha)


def names() -> list[str]:
    return sorted(_COLOURS)


if __name__ == "__main__":
    print(json.dumps({n: rgb(n) for n in names()}))

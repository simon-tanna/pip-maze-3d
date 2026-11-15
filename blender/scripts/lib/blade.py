"""The blade outline, read from src/core/blade-shape.json: the one source the core contact
rule (src/core/blade.ts) and the blade mesh (build_blade.py) share, so they can't drift
(ADR 0002). Pure Python (no bpy).

`head_ring()` mirrors `HEAD_RING` in blade.ts point for point: the crescent's outer edge
then its inner edge, each a quadratic sampled into `samples` straight segments, head-local
(origin at the arm's end, edge toward −y), in three.js's swing-plane frame (x, y).
"""

import json
from pathlib import Path

SHAPE_JSON = Path(__file__).resolve().parents[3] / "src" / "core" / "blade-shape.json"


def load_shape() -> dict:
    return json.loads(SHAPE_JSON.read_text(encoding="utf-8"))


SHAPE = load_shape()
PIVOT_HEIGHT: float = SHAPE["pivotHeight"]
ARM: float = SHAPE["arm"]
HALF_THICKNESS: float = SHAPE["halfThickness"]


def _quad(curve, n: int) -> list[tuple[float, float]]:
    (ax, ay), (cx, cy), (bx, by) = curve
    pts = []
    for i in range(n + 1):
        t = i / n
        k = (1 - t) ** 2
        m = 2 * (1 - t) * t
        pts.append((k * ax + m * cx + t * t * bx, k * ay + m * cy + t * t * by))
    return pts


def head_ring() -> list[tuple[float, float]]:
    """The crescent as a closed ring: outer edge (left horn → right horn), then inner."""
    samples = SHAPE["samples"]
    return _quad(SHAPE["outer"], samples["outer"]) + _quad(SHAPE["inner"], samples["inner"])


def outer_count() -> int:
    """How many of `head_ring()`'s first points are the outer (cutting) edge."""
    return SHAPE["samples"]["outer"] + 1


if __name__ == "__main__":
    print(json.dumps(head_ring()))

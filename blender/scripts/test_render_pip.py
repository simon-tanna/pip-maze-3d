"""Pip's look-dev renders: render_pip writes the turnaround and the game-camera shot.

Renders at a small scale into a temp dir and checks the files, their sizes, and that the
game shot frames Pip from the in-game camera at game scale. The ticket's "about 90 px" is
Pip's 1.5 m at the camera's ~58 px/m; the 66 deg pitch foreshortens him to ~60 px. Exits
non-zero on any failure.

Run: pnpm assets:test
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from render_pip import GAME_PITCH_DEG, SHOTS, render_all  # noqa: E402

EXPECTED = ("front", "three-quarter", "side", "back", "walk", "game", "game-zoom")


def main() -> None:
    failures = []
    if tuple(SHOTS) != EXPECTED:
        failures.append(f"shots are {tuple(SHOTS)}, expected {EXPECTED}")
    if not 64.0 <= GAME_PITCH_DEG <= 67.0:
        failures.append(f"game camera pitch {GAME_PITCH_DEG:.1f} deg is not about 65 deg")

    with tempfile.TemporaryDirectory() as tmp:
        report = render_all(Path(tmp), "t", scale=0.25, samples=1)
        for shot in EXPECTED:
            path = Path(tmp) / f"t-{shot}.png"
            if not path.exists():
                failures.append(f"{shot}: {path.name} was not written")
                continue
            img = bpy.data.images.load(str(path))
            w, h = img.size
            if w <= 0 or h <= 0:
                failures.append(f"{shot}: empty image")
            print(f"[ok] {shot}: {path.name} {w}x{h}")
        # The game frame is 1920x1080 at scale 1; Pip's projected height is measured there.
        px = report["game_height_px_1080"]
        if not 50 <= px <= 100:
            failures.append(f"Pip is {px:.0f} px tall in the 1080p game shot, not game scale")
        else:
            print(f"[ok] Pip is {px:.0f} px tall in the 1080p game shot")

    for f in failures:
        print(f"[FAIL] {f}")
    if failures:
        sys.exit(1)
    print("[test] render_pip passed")


if __name__ == "__main__":
    main()

"""Run every procedural builder, so a palette change can rebuild every GLB.

A builder registers by being a `blender/scripts/build_<name>.py` that does its work under
`if __name__ == "__main__":` and starts from a fresh scene. Builders run in name order in
this one Blender process; any exception fails the whole run (non-zero exit).

Run: pnpm assets:build
"""

import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main() -> None:
    builders = sorted(p for p in HERE.glob("build_*.py") if p.name != Path(__file__).name)
    if not builders:
        raise SystemExit("[build] no build_*.py builders found")
    for builder in builders:
        print(f"[build] {builder.name}")
        runpy.run_path(str(builder), run_name="__main__")
    print(f"[build] done: {len(builders)} builder(s)")


main()

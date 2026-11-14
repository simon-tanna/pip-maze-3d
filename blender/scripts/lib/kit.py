"""Chamber kit dimensions shared by the kit builders (sandstone and placeholder).

The node names and local frames are the contract in src/render/chamber-kit.ts, checked by
tests/unit/chamber-kit.test.ts.
"""

TILE_SIZE = 2.0  # metres — must match TILE_SIZE in src/core/grid.ts
WALL_HEIGHT = 2.2  # metres — must match WALL_HEIGHT in src/render/chamber-kit.ts
CAP_THICKNESS = 0.2
SLOT_WIDTH = 0.4  # face_slot / cap_slot: the gap a blade spins through
CONTACT_LIFT = 0.01  # above the floor, so the strip never z-fights it

HALF = TILE_SIZE / 2

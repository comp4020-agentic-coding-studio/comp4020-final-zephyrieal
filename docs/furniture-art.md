# Furniture artwork and interaction bounds

The cozy furniture sheet was generated with the built-in image generator on 2026-10-23. It contains three rows (hay basket, wooden tunnel, sage-roof hideout) and three columns (front, back, side). The side tunnel is drawn vertically to match the rotated 1×3 tile footprint.

BootScene trims each sheet cell to its alpha bounds. IndoorScene fits both placed pieces and previews inside the shared, server-validated footprint without stretching the art. Click selection checks opaque pixels instead of transparent image padding. Placement previews outline the actual reserved tiles; rotation keeps the existing server rules. Pointer-down recalculates the placement tile so touch taps do not reuse a stale hover position.

Art direction: cute minimal cozy pixel art, elevated top-down view, warm brown outlines, wicker hay baskets, hollow logs, rounded wooden hideouts with sage roofs; transparent background, no labels or scenery. Original sheet retained unchanged in src/client/assets/sprites/furniture-cozy.png.

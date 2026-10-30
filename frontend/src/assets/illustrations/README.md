# Season run player

`soccer-player-outline-source.svg` traces the complete user-supplied JPEG reference, including its separate ball. Its white background is omitted. The illustration consists of filled vector contours with even-odd holes, not an embedded raster image. It was traced at the source resolution with approximately 1.5-pixel contour simplification and local cubic curve smoothing, preserving the reference outline rather than redrawing a different pose. A JPEG cannot recover an original vector mathematically exactly; these paths are a faithful trace of its visible edges.

`soccer-player-outline.svg` is the white player-only variant consumed by `SeasonRunner` in `SeasonOverview.tsx`. The separate source-ball component is omitted because the mint current-week marker already serves as the ball. Its viewBox is tightly bounded and scales without pixelation. CSS centers it above the current-week marker at 95x65 pixels, half the former 190x130 image box. No opacity filter, clipping mask, or remote asset request is required.

The superseded generated PNG was removed; the app now uses vector artwork exclusively for the player and week ball.

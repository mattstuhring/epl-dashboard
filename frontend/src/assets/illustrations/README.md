# Season run player

`soccer-player-outline-source.svg` traces the complete user-supplied JPEG reference, including its separate ball. Its white background is omitted. The illustration consists of filled vector contours with even-odd holes, not an embedded raster image. It was traced at the source resolution with approximately 1.5-pixel contour simplification and local cubic curve smoothing, preserving the reference outline rather than redrawing a different pose. A JPEG cannot recover an original vector mathematically exactly; these paths are a faithful trace of its visible edges.

`soccer-player-outline.svg` is the white player-only variant consumed by `SeasonRunner` in `SeasonOverview.tsx`. The separate source-ball component is omitted because the mint current-week marker already serves as the ball. Its viewBox is tightly bounded and scales without pixelation. CSS centers it above the current-week marker at 95x65 pixels, half the former 190x130 image box. No opacity filter, clipping mask, or remote asset request is required.

The superseded generated PNG was removed; the app now uses vector artwork exclusively for the player and week ball.

## Matchday side pattern

`matchday-pattern.svg` continues the supplied reference's central notched diagonal band on a 458-unit vertical cadence. The preceding crossing band is included so the tile's top and bottom alpha boundaries match. Both sides use this one mask in the same orientation. CSS repeats it vertically at a maximum 200px strip width and supplies one continuous green-to-purple gradient (#03efb4 to #9738ff). The pattern stays inside the dashboard's padded edges, clears the card by at least 24px and hides below 1360px. `MatchdaySideArt` owns its decorative, non-interactive markup. No remote asset or runtime drawing is needed.

## Matchweek split photograph

`matchweek-pitch-photo.jpg` is the unchanged 818×500 user-supplied `designstudio-premier-league-logo-graphic-design-designboom-02.jpg` reference. `MatchweekSideArt` displays two card-height clipping windows: the left window shows the original left half and the right window shows the original right half. CSS anchors the split at the source center and crops the outer edges to fill the available gutters without mirroring, tinting or stretching it. Both halves are decorative, non-interactive and hidden below 1360px.

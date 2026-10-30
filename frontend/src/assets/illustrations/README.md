# Season run player

`season-run-player.png` is the transparent preview asset approved for the club season timeline on 2026-10-30. It was generated with the built-in image tool from the user’s running-player reference and reduced to 320 pixels wide for local bundling. No remote image request is needed.

The prompt asked for a balanced, flat white dribbling silhouette and mint football on transparency, with the reference proportions. The approved preview applies an alpha threshold to suppress the generated halo; `SeasonJourney` owns that scoped filter and its positioning. A CSS clip excludes the source ball's lower-right region, including residual halo; the filter only cleans the silhouette alpha. The enlarged current-week marker is a separate flat mint football drawn in SeasonOverview, with the player shifted behind it. A future vector replacement can remove the filter once the silhouette is approved.

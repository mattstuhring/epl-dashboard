/**
 * Own the static half-field illustration beneath the desktop matchweek panels.
 * Its shallow, artistic proportions prioritize fixture space over pitch dimensions.
 */

/**
 * Render decorative vector linework without data, animation, or resize listeners.
 * @returns An accessibility-hidden half-field; CSS reserves its desktop-only space.
 */
export function MatchweekPitch() {
  return (
    <div className="matchweek-pitch" aria-hidden="true">
      <svg viewBox="0 0 1800 150" preserveAspectRatio="none" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          {/* Shared boundary edges are drawn once to keep the box joins uniform. */}
          <path
            vectorEffect="non-scaling-stroke"
            d="M10 9H1790V141H10Z M900 9V141
               M10 53.88H330.4V141 M1790 53.88H1469.6V141
               M10 101.4H125.7V141 M1790 101.4H1674.3V141"
          />
          {/* Semicircle, clipped penalty arcs, and quarter-circle corner markers. */}
          <path
            vectorEffect="non-scaling-stroke"
            d="M814.2 141A85.8 85.8 0 0 1 985.8 141
               M330.4 96.648A55.44 55.44 0 0 1 352.576 141
               M1447.424 141A55.44 55.44 0 0 1 1469.6 96.648
               M22 9A12 12 0 0 1 10 21
               M1778 9A12 12 0 0 0 1790 21"
          />
        </g>
      </svg>
    </div>
  )
}

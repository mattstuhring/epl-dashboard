/**
 * Own the static half-field illustrations framing the desktop matchweek panels.
 * Its shallow, artistic proportions prioritize fixture space over pitch dimensions.
 */

/**
 * Render a green pitch with white markings, without data or animation.
 * @param props Position in the frame; the bottom field is reflected vertically.
 * @returns An accessibility-hidden half-field; CSS reserves its desktop-only space.
 */
export function MatchweekPitch({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div className={`matchweek-pitch matchweek-pitch--${edge}`} aria-hidden="true">
      <svg viewBox="0 0 1800 150" preserveAspectRatio="none" focusable="false">
        <rect className="matchweek-pitch-surface" x="10" y="9" width="1780" height="132" />
        <path fill="currentColor" d="M880 141A20 20 0 0 1 920 141Z" />
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
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

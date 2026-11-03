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
      <svg viewBox="0 0 1800 100" preserveAspectRatio="none" focusable="false">
        <rect className="matchweek-pitch-surface" x="10" y="9" width="1780" height="82" />
        <path fill="currentColor" d="M887 91A13 13 0 0 1 913 91Z" />
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          {/* Shared boundary edges are drawn once to keep the box joins uniform. */}
          <path
            vectorEffect="non-scaling-stroke"
            d="M10 9H1790V91H10Z M900 9V91
               M10 37H330.4V91 M1790 37H1469.6V91
               M10 66H125.7V91 M1790 66H1674.3V91"
          />
          {/* Semicircle, clipped penalty arcs, and quarter-circle corner markers. */}
          <path
            vectorEffect="non-scaling-stroke"
            d="M832 91A68 68 0 0 1 968 91
               M330.4 63A35 35 0 0 1 344.4 91
               M1455.6 91A35 35 0 0 1 1469.6 63
               M22 9A12 12 0 0 1 10 21
               M1778 9A12 12 0 0 0 1790 21"
          />
        </g>
      </svg>
    </div>
  )
}

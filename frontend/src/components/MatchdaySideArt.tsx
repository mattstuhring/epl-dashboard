/**
 * Own the green-to-purple reference graphics in Matchday's outer gutters.
 * One seamless SVG mask repeats vertically beneath a continuous CSS gradient.
 */

/**
 * Render non-interactive artwork; responsive CSS hides it when gutters are too narrow.
 */
export function MatchdaySideArt() {
  return (
    <div className="matchday-side-art" aria-hidden="true">
      <div className="matchday-pattern matchday-side-left" />
      <div className="matchday-pattern matchday-side-right" />
    </div>
  )
}

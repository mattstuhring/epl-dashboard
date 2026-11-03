/**
 * Own the reference-matched cyan/blue/violet graphics in Matchday's outer gutters.
 * Transparent static SVGs preserve sharp shapes without covering fixture content.
 */
import leftSide from '../assets/illustrations/matchday-side-left.svg'
import rightSide from '../assets/illustrations/matchday-side-right.svg'

/**
 * Render non-interactive artwork; responsive CSS hides it when gutters are too narrow.
 */
export function MatchdaySideArt() {
  return (
    <div className="matchday-side-art" aria-hidden="true">
      <img className="matchday-side-left" src={leftSide} alt="" />
      <img className="matchday-side-right" src={rightSide} alt="" />
    </div>
  )
}

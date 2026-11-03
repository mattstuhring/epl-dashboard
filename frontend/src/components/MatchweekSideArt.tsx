/**
 * Display the supplied pitch photograph as two complementary vertical halves.
 * CSS crops one bundled image at its center, preserving the original proportions.
 */
import pitchPhoto from '../assets/illustrations/matchweek-pitch-photo.jpg'

/**
 * Frame Matchweek with non-interactive image halves; narrow layouts hide both.
 */
export function MatchweekSideArt() {
  return (
    <div className="matchweek-side-art" aria-hidden="true">
      <div className="matchweek-photo-half matchweek-photo-left">
        <img src={pitchPhoto} alt="" />
      </div>
      <div className="matchweek-photo-half matchweek-photo-right">
        <img src={pitchPhoto} alt="" />
      </div>
    </div>
  )
}

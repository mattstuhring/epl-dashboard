/**
 * Render optional remote crest images without losing club identity when they fail.
 * Callers retain visible club names; this decorative image uses an initials fallback.
 */
import { useState } from 'react'

/**
 * Display a decorative HTTPS crest, falling back to initials when absent or failed.
 * @param props Club name for initials and optional image URL; visible names belong to callers.
 * @returns An image with empty alt text or an aria-hidden initials mark.
 */
export function TeamCrest({ name, url }: { name: string; url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (url?.startsWith('https://') && failedUrl !== url) {
    return (
      <img
        className="team-crest"
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    )
  }

  return (
    <span className="crest-fallback" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

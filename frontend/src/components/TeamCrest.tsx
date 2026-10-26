import { useState } from 'react'

/** Keep club names readable when a crest is missing or cannot load. */
export function TeamCrest({ name, url }: { name: string; url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (url?.startsWith('https://') && failedUrl !== url) {
    return <img
      className="team-crest"
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  }

  return <span className="crest-fallback" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
}

import type { SourceRef } from '@/lib/types'
import { sourceHref, sourceLabel } from '@/lib/sources'

export function SourceBadge({ source }: { source: SourceRef }) {
  const href = sourceHref(source)
  return (
    <a
      className={`sourceBadge source-${source.kind}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={source.note || `מקור: ${sourceLabel(source)}`}
    >
      <span aria-hidden="true">↗</span>
      {sourceLabel(source)}
    </a>
  )
}

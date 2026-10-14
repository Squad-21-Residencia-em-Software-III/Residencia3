import type { ReactNode } from 'react'

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'purple'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" />
      {children}
    </span>
  )
}

export function IdBadge({ id }: { id: string }) {
  return <span className="id-badge">{id}</span>
}

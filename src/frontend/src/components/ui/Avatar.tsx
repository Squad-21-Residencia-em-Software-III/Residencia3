import type { CSSProperties } from 'react'

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const hue = ((name.charCodeAt(0) || 0) * 37) % 360
  const style = { '--avatar-size': `${size}px`, background: `hsl(${hue}, 55%, 42%)` } as CSSProperties

  return (
    <span className="avatar" style={style} aria-hidden="true">
      {initials}
    </span>
  )
}

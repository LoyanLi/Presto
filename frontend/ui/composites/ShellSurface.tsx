import type { CSSProperties, ReactNode } from 'react'
import Box from '@mui/material/Box'

export interface ShellSurfaceProps {
  density?: 'standard' | 'dense'
  maxWidth?: string | number
  edgeToEdge?: boolean
  children: ReactNode
}

export function ShellSurface({
  density = 'standard',
  maxWidth,
  edgeToEdge = false,
  children,
}: ShellSurfaceProps) {
  const innerStyle: CSSProperties =
    density === 'dense'
      ? {
          gap: 'var(--presto-space-lg)',
        }
      : {}

  if (!edgeToEdge && maxWidth !== undefined) {
    innerStyle.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth
    innerStyle.width = '100%'
  }

  return (
    <Box className={`presto-shell-surface presto-shell-surface--halo${edgeToEdge ? ' presto-shell-surface--edge-to-edge' : ''}`}>
      <Box className={edgeToEdge ? 'presto-shell-surface__inner' : 'presto-shell-surface__inner presto-animate-in'} style={innerStyle}>
        {children}
      </Box>
    </Box>
  )
}

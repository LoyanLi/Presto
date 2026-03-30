import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

export interface CapabilityDetailPanelProps {
  title: ReactNode
  status?: ReactNode
  main: ReactNode
  side: ReactNode
}

export function CapabilityDetailPanel({ title, status, main, side }: CapabilityDetailPanelProps) {
  return (
    <Paper component="section" elevation={0} className="presto-capability-detail">
      <Box className="presto-capability-detail__header">
        <Typography component="h3" className="presto-capability-detail__title">
          {title}
        </Typography>
        {status}
      </Box>
      <Box
        className="presto-capability-detail__body"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        <Box>{main}</Box>
        <Box style={{ display: 'grid', gap: 'var(--presto-space-md)' }}>{side}</Box>
      </Box>
    </Paper>
  )
}

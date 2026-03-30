import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

export interface CapabilityRowProps {
  title: ReactNode
  capabilityId: ReactNode
  note: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  active?: boolean
  footer?: ReactNode
}

export function CapabilityRow({
  title,
  capabilityId,
  note,
  meta,
  actions,
  active = false,
  footer,
}: CapabilityRowProps) {
  return (
    <Paper elevation={0} className="presto-capability-row" data-active={active}>
      <Box className="presto-capability-row__top">
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" className="presto-capability-row__name">
            {title}
          </Typography>
          <Typography component="p" className="presto-capability-row__id">
            {capabilityId}
          </Typography>
        </Box>
        {actions ? <Box className="presto-capability-row__actions">{actions}</Box> : null}
      </Box>
      {meta ? <Box className="presto-capability-row__meta">{meta}</Box> : null}
      <Typography component="p" className="presto-capability-row__note">
        {note}
      </Typography>
      {footer ? <Box>{footer}</Box> : null}
    </Paper>
  )
}

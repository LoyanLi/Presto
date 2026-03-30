import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { Badge } from '../primitives/Badge'

export interface DomainGroupProps {
  title: ReactNode
  count: number
  runnableCount?: number
  summary?: ReactNode
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function DomainGroup({
  title,
  count,
  runnableCount = 0,
  summary,
  expanded,
  onToggle,
  children,
}: DomainGroupProps) {
  return (
    <Paper component="article" elevation={0} className="presto-domain-group">
      <ButtonBase className="presto-domain-group__toggle presto-focusable" onClick={onToggle}>
        <Stack spacing={0.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
          <Box className="presto-domain-group__title-row">
            <Typography component="h3" className="presto-domain-group__title">
              {title}
            </Typography>
            <Typography component="span" className="presto-domain-group__count">
              {count} capabilities
            </Typography>
            {runnableCount > 0 ? <Badge tone="brand">{runnableCount} runnable</Badge> : null}
          </Box>
          {summary ? (
            <Typography component="p" className="presto-domain-group__summary">
              {summary}
            </Typography>
          ) : null}
        </Stack>
        <Badge tone="neutral">{expanded ? 'Collapse' : 'Expand'}</Badge>
      </ButtonBase>
      {expanded ? <Box className="presto-domain-group__content">{children}</Box> : null}
    </Paper>
  )
}

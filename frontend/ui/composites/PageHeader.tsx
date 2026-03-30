import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

import { SectionHeader } from '../primitives/SectionHeader'

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  metadata?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, subtitle, metadata, actions }: PageHeaderProps) {
  return (
    <Box className="presto-page-header presto-page-header--halo">
      <Box sx={{ display: 'grid', gap: 'var(--presto-space-md)', flex: '1 1 520px', minWidth: 0 }}>
        <SectionHeader eyebrow={eyebrow} title={title} description={subtitle} />
        {metadata ? (
          <Box
            className="presto-page-header__meta"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--presto-space-sm)' }}
          >
            {metadata}
          </Box>
        ) : null}
      </Box>
      {actions ? <Box className="presto-page-header__actions">{actions}</Box> : null}
    </Box>
  )
}

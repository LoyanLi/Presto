import type { ReactNode } from 'react'
import MuiTab from '@mui/material/Tab'
import MuiTabs from '@mui/material/Tabs'

import { cx } from '../utils/cx'

export interface TabItem<T extends string> {
  id: T
  label: string
  count?: number
  icon?: ReactNode
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <MuiTabs
      value={value}
      onChange={(_event, nextValue) => onChange(nextValue)}
      className={cx('ui-tabs', 'ui-tabs--halo', className)}
      variant="scrollable"
      scrollButtons="auto"
      aria-label="Tabs"
      sx={{
        minHeight: 'auto',
        '& .MuiTabs-flexContainer': {
          gap: '0.35rem',
          flexWrap: 'wrap',
        },
        '& .MuiTabs-indicator': {
          display: 'none',
        },
      }}
    >
      {items.map((item) => (
        <MuiTab
          key={item.id}
          value={item.id}
          className={cx('ui-tabs__tab', value === item.id && 'ui-tabs__tab--active')}
          icon={item.icon ? <span aria-hidden>{item.icon}</span> : undefined}
          iconPosition={item.icon ? 'start' : undefined}
          label={typeof item.count === 'number' ? `${item.label} (${item.count})` : item.label}
          disableRipple
          sx={{
            minHeight: 'auto',
            minWidth: 0,
            padding: '0.22rem 0.65rem',
          }}
        />
      ))}
    </MuiTabs>
  )
}

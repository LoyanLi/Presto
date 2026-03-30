import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

import { cx } from '../utils/cx'

export type CodeBlockTone = 'default' | 'success' | 'error'

export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode
  language?: ReactNode
  children: ReactNode
  tone?: CodeBlockTone
}

export function CodeBlock({
  title,
  language,
  tone = 'default',
  className,
  style,
  children,
  ...props
}: CodeBlockProps) {
  const toneStyle: CSSProperties =
    tone === 'success'
      ? {
          borderColor: 'color-mix(in srgb, var(--presto-color-primary) 48%, black)',
        }
      : tone === 'error'
        ? {
            borderColor: 'color-mix(in srgb, var(--presto-color-error) 48%, black)',
          }
        : {}

  return (
    <Paper
      {...props}
      elevation={0}
      className={cx('presto-code-block', className)}
      style={{ ...toneStyle, ...style }}
    >
      {title || language ? (
        <Box className="presto-code-block__header">
          <Typography component="span" className="presto-code-block__title">
            {title}
          </Typography>
          {language ? (
            <Typography component="span" className="presto-code-block__lang">
              {language}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <pre>{children}</pre>
    </Paper>
  )
}

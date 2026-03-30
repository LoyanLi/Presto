import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'
import { CodeBlock, type CodeBlockTone } from './CodeBlock'

function prettyPrintJson(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}

export interface JsonViewProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode
  language?: ReactNode
  value: unknown
  tone?: CodeBlockTone
  emptyLabel?: ReactNode
}

export function JsonView({
  title,
  language = 'json',
  value,
  tone = 'default',
  emptyLabel = 'No data.',
  className,
  ...props
}: JsonViewProps) {
  const text = prettyPrintJson(value)
  const hasContent = typeof text === 'string' && text.trim().length > 0

  return (
    <div {...props} className={cx('presto-json-view', className)}>
      <CodeBlock title={title} language={language} tone={tone}>
        {hasContent ? text : String(emptyLabel)}
      </CodeBlock>
    </div>
  )
}

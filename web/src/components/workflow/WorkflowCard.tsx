import { ReactNode } from 'react'

type WorkflowCardProps = {
  title?: string
  subtitle?: string
  rightSlot?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  noBodyPadding?: boolean
}

export function WorkflowCard({
  title,
  subtitle,
  rightSlot,
  children,
  className = '',
  bodyClassName = '',
  noBodyPadding = false,
}: WorkflowCardProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`.trim()}>
      {title || subtitle || rightSlot ? (
        <div className="p-4 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg font-semibold text-gray-900">{title}</h2> : null}
            {subtitle ? <p className="text-sm text-gray-600 mt-1">{subtitle}</p> : null}
          </div>
          {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
        </div>
      ) : null}
      <div className={`${noBodyPadding ? '' : 'p-4'} ${bodyClassName}`.trim()}>{children}</div>
    </div>
  )
}

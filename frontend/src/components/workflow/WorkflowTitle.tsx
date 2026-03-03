import { ReactNode } from 'react'

type WorkflowTitleProps = {
  title: string
  subtitle: string
  rightSlot?: ReactNode
}

export function WorkflowTitle({ title, subtitle, rightSlot }: WorkflowTitleProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
      </div>
    </div>
  )
}

import { ReactNode } from 'react'

type WorkflowActionBarProps = {
  leftHint?: ReactNode
  children: ReactNode
}

export function WorkflowActionBar({ leftHint, children }: WorkflowActionBarProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-6 py-3">
      <div className={`flex items-center ${leftHint ? 'justify-between' : 'justify-end'}`}>
        {leftHint ? <div className="text-sm text-gray-600">{leftHint}</div> : null}
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  )
}

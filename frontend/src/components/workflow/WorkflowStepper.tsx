type WorkflowStepperProps = {
  steps: string[]
  currentStep: number
}

export function WorkflowStepper({ steps, currentStep }: WorkflowStepperProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-center space-x-8">
        {steps.map((label, idx) => {
          const step = idx + 1
          const isActive = currentStep === step
          const isCompleted = currentStep > step
          return (
            <div key={label} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isCompleted
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                }`}
              >
                {step}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
              {step < steps.length ? (
                <div className={`ml-8 w-16 h-0.5 ${isCompleted ? 'bg-green-600' : 'bg-gray-300'}`} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

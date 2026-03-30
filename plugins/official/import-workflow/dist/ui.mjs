import React from './react-shared.mjs'

const h = React.createElement

function resolveSharedUi() {
  const shared =
    globalThis.window?.__PRESTO_PLUGIN_SHARED__?.ui ??
    globalThis.__PRESTO_PLUGIN_SHARED__?.ui
  if (!shared || typeof shared !== 'object') {
    return {}
  }
  return shared
}

const sharedUi = resolveSharedUi()

function toSharedButtonVariant(variant) {
  if (variant === 'primary') {
    return 'primary'
  }
  if (variant === 'danger') {
    return 'danger'
  }
  if (variant === 'secondary') {
    return 'secondary'
  }
  return 'tertiary'
}

export function WorkflowButton({
  variant = 'secondary',
  small = false,
  className,
  style,
  children,
  ...props
}) {
  if (typeof sharedUi.Button === 'function') {
    return h(
      sharedUi.Button,
      {
        ...props,
        variant: toSharedButtonVariant(variant),
        size: small ? 'sm' : 'md',
        className: ['iw-plugin-button', className].filter(Boolean).join(' '),
        style,
      },
      children,
    )
  }

  const fallbackVariant =
    variant === 'primary' || variant === 'danger' || variant === 'secondary' ? variant : 'muted'
  const fallbackClass = [
    'iw-fallback-button',
    `iw-fallback-button--${fallbackVariant}`,
    small ? 'iw-fallback-button--small' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return h(
    'button',
    {
      ...props,
      type: props.type ?? 'button',
      className: fallbackClass,
      style,
    },
    children,
  )
}

export function WorkflowTitle({ title, subtitle, rightSlot }) {
  if (typeof sharedUi.PageHeader === 'function') {
    return h(sharedUi.PageHeader, {
      title,
      subtitle,
      actions: rightSlot,
    })
  }

  return h(
    'div',
    { className: 'iw-title' },
    h(
      'div',
      { className: 'iw-title-main' },
      h('div', null, h('h1', { className: 'iw-h1' }, title), h('p', { className: 'iw-subtitle' }, subtitle)),
      rightSlot ? h('div', { className: 'iw-title-actions' }, rightSlot) : null,
    ),
  )
}

export function WorkflowInput({ label, hint, error, className, ...props }) {
  if (typeof sharedUi.Input === 'function') {
    return h(sharedUi.Input, {
      ...props,
      label,
      hint,
      error,
      className: ['iw-field-control', className].filter(Boolean).join(' '),
    })
  }

  return h(
    'label',
    { className: ['iw-field', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'iw-field-label' }, label) : null,
    h('input', {
      ...props,
      className: 'iw-input',
    }),
    error ? h('span', { className: 'iw-field-hint iw-field-hint--error' }, error) : hint ? h('span', { className: 'iw-field-hint' }, hint) : null,
  )
}

export function WorkflowSelect({ label, hint, error, options, className, ...props }) {
  if (typeof sharedUi.Select === 'function') {
    return h(sharedUi.Select, {
      ...props,
      label,
      hint,
      error,
      options,
      className: ['iw-field-control', className].filter(Boolean).join(' '),
    })
  }

  return h(
    'label',
    { className: ['iw-field', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'iw-field-label' }, label) : null,
    h(
      'select',
      {
        ...props,
        className: 'iw-select',
      },
      (Array.isArray(options) ? options : []).map((option) =>
        h('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
    error ? h('span', { className: 'iw-field-hint iw-field-hint--error' }, error) : hint ? h('span', { className: 'iw-field-hint' }, hint) : null,
  )
}

export function WorkflowTextarea({ label, hint, error, className, minHeight, ...props }) {
  if (typeof sharedUi.Textarea === 'function') {
    return h(sharedUi.Textarea, {
      ...props,
      label,
      hint,
      error,
      minHeight,
      className: ['iw-field-control', className].filter(Boolean).join(' '),
    })
  }

  return h(
    'label',
    { className: ['iw-field', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'iw-field-label' }, label) : null,
    h('textarea', {
      ...props,
      className: 'iw-textarea',
      style: minHeight ? { minHeight } : undefined,
    }),
    error ? h('span', { className: 'iw-field-hint iw-field-hint--error' }, error) : hint ? h('span', { className: 'iw-field-hint' }, hint) : null,
  )
}

export function WorkflowStepper({ steps, currentStep }) {
  if (typeof sharedUi.WorkflowStepper === 'function') {
    return h(sharedUi.WorkflowStepper, {
      steps,
      currentStep,
      className: 'iw-stepper',
    })
  }

  return h(
    'div',
    { className: 'iw-stepper' },
    h(
      'div',
      { className: 'iw-stepper-row' },
      steps.map((label, index) => {
        const step = index + 1
        const isActive = step === currentStep
        const isCompleted = step < currentStep
        return h(
          'div',
          { key: label, className: 'iw-step' },
          h(
            'span',
            {
              className: `iw-step-index${isActive ? ' is-active' : ''}${isCompleted ? ' is-complete' : ''}`,
            },
            String(step),
          ),
          h('span', { className: `iw-step-label${isActive ? ' is-active' : ''}${isCompleted ? ' is-complete' : ''}` }, label),
        )
      }),
    ),
  )
}

export function WorkflowCard({ title, subtitle, rightSlot, children, className }) {
  if (typeof sharedUi.Panel === 'function') {
    return h(
      sharedUi.Panel,
      {
        title,
        description: subtitle,
        actions: rightSlot,
        className: ['iw-card', className].filter(Boolean).join(' '),
      },
      children,
    )
  }

  return h(
    'section',
    { className: ['iw-card', className].filter(Boolean).join(' ') },
    title || subtitle || rightSlot
      ? h(
          'header',
          { className: 'iw-card-header' },
          h('div', null, title ? h('h2', { className: 'iw-h2' }, title) : null, subtitle ? h('p', { className: 'iw-card-subtitle' }, subtitle) : null),
          rightSlot ? h('div', { className: 'iw-card-actions' }, rightSlot) : null,
        )
      : null,
    h('div', { className: 'iw-card-body' }, children),
  )
}

export function WorkflowActionBar({ children, className, sticky = true, align = 'end' }) {
  if (typeof sharedUi.WorkflowActionBar === 'function') {
    return h(
      sharedUi.WorkflowActionBar,
      {
        className: ['iw-action-bar', className].filter(Boolean).join(' '),
        sticky,
        align,
      },
      children,
    )
  }

  const outerClassName = [
    'iw-action-bar',
    'presto-workflow-action-bar',
    sticky ? 'presto-workflow-action-bar--sticky' : null,
    className,
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ')

  const innerClassName = [
    'iw-action-bar-inner',
    'presto-workflow-action-bar__inner',
    align === 'start' ? 'presto-workflow-action-bar__inner--start' : null,
    align === 'space-between' ? 'presto-workflow-action-bar__inner--space-between' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return h(
    'div',
    { className: outerClassName },
    h('div', { className: innerClassName }, children),
  )
}

export function StatusPill({ status }) {
  const normalized = String(status ?? 'pending')
  let toneClass = 'is-pending'
  let sharedTone = 'neutral'
  if (normalized === 'ready' || normalized === 'succeeded') {
    toneClass = 'is-ready'
    sharedTone = 'success'
  } else if (normalized === 'failed' || normalized === 'cancelled') {
    toneClass = 'is-failed'
    sharedTone = 'danger'
  } else if (normalized === 'skipped') {
    toneClass = 'is-skipped'
    sharedTone = 'public'
  }

  if (typeof sharedUi.Badge === 'function') {
    return h(sharedUi.Badge, { tone: sharedTone }, normalized)
  }

  return h('span', { className: `iw-status-pill ${toneClass}` }, normalized)
}

export function InlineError({ message }) {
  if (!message) {
    return null
  }
  return h('div', { className: 'iw-error' }, message)
}

export function StatItem({ label, value }) {
  if (typeof sharedUi.StatChip === 'function') {
    return h(sharedUi.StatChip, {
      label,
      value: String(value),
    })
  }

  return h('div', { className: 'iw-stat-item' }, h('div', { className: 'iw-stat-label' }, label), h('div', { className: 'iw-stat-value' }, String(value)))
}

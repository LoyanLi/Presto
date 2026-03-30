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

function toButtonVariant(variant) {
  if (variant === 'primary') {
    return 'primary'
  }
  if (variant === 'danger') {
    return 'danger'
  }
  if (variant === 'tertiary') {
    return 'tertiary'
  }
  return 'secondary'
}

export function WorkflowButton({ variant = 'secondary', small = false, className, children, ...props }) {
  if (typeof sharedUi.Button === 'function') {
    return h(
      sharedUi.Button,
      {
        ...props,
        variant: toButtonVariant(variant),
        size: small ? 'sm' : 'md',
        className: ['ew-button', className].filter(Boolean).join(' '),
      },
      children,
    )
  }

  return h(
    'button',
    {
      ...props,
      className: ['ew-button-fallback', `is-${variant}`, small ? 'is-small' : null, className]
        .filter(Boolean)
        .join(' '),
    },
    children,
  )
}

export function WorkflowIconButton({ label, icon, className, ...props }) {
  if (typeof sharedUi.IconButton === 'function') {
    return h(sharedUi.IconButton, {
      ...props,
      label,
      icon,
      className,
    })
  }

  return h(
    'button',
    {
      ...props,
      type: props.type || 'button',
      'aria-label': label,
      title: label,
      className: ['ew-icon-button-fallback', className].filter(Boolean).join(' '),
    },
    icon,
  )
}

export function WorkflowInput({ label, hint, error, className, startAdornment, endAdornment, ...props }) {
  if (typeof sharedUi.Input === 'function') {
    return h(sharedUi.Input, {
      ...props,
      label,
      hint,
      error,
      startAdornment,
      endAdornment,
      className: ['ew-field-control', className].filter(Boolean).join(' '),
    })
  }

  return h(
    'label',
    { className: ['ew-field', className].filter(Boolean).join(' ') },
    label ? h('span', null, label) : null,
    h('input', {
      ...props,
      className: 'ew-input',
    }),
  )
}

export function WorkflowSelect({ label, hint, error, options, className, startAdornment, endAdornment, ...props }) {
  if (typeof sharedUi.Select === 'function') {
    return h(sharedUi.Select, {
      ...props,
      label,
      hint,
      error,
      options,
      startAdornment,
      endAdornment,
      className: ['ew-field-control', className].filter(Boolean).join(' '),
    })
  }

  return h(
    'label',
    { className: ['ew-field', className].filter(Boolean).join(' ') },
    label ? h('span', null, label) : null,
    h(
      'select',
      {
        ...props,
        className: 'ew-select',
      },
      (Array.isArray(options) ? options : []).map((option) =>
        h('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
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
    { className: 'ew-title' },
    h(
      'div',
      { className: 'ew-title-main' },
      h('div', null, h('h1', { className: 'ew-h1' }, title), subtitle ? h('p', { className: 'ew-subtitle' }, subtitle) : null),
      rightSlot ? h('div', { className: 'ew-title-actions' }, rightSlot) : null,
    ),
  )
}

export function WorkflowStepper({ steps, currentStep }) {
  if (typeof sharedUi.WorkflowStepper === 'function') {
    return h(sharedUi.WorkflowStepper, {
      steps,
      currentStep,
      className: 'ew-stepper',
    })
  }

  return h(
    'div',
    { className: 'ew-stepper' },
    h(
      'div',
      { className: 'ew-stepper-row' },
      steps.map((label, index) => {
        const step = index + 1
        const isActive = step === currentStep
        const isComplete = step < currentStep
        return h(
          'div',
          { key: label, className: 'ew-step' },
          h(
            'span',
            {
              className: ['ew-stepper-index', isActive ? 'is-active' : null, isComplete ? 'is-complete' : null]
                .filter(Boolean)
                .join(' '),
            },
            String(step),
          ),
          h(
            'span',
            {
              className: ['ew-stepper-label', isActive ? 'is-active' : null, isComplete ? 'is-complete' : null]
                .filter(Boolean)
                .join(' '),
            },
            label,
          ),
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
        className,
      },
      children,
    )
  }

  return h(
    'section',
    { className: ['ew-card', className].filter(Boolean).join(' ') },
    title || subtitle || rightSlot
      ? h(
          'header',
          { className: 'ew-card-header' },
          h('div', null, title ? h('h2', { className: 'ew-h2' }, title) : null, subtitle ? h('p', { className: 'ew-card-subtitle' }, subtitle) : null),
          rightSlot ? h('div', { className: 'ew-card-actions' }, rightSlot) : null,
        )
      : null,
    h('div', { className: 'ew-card-body' }, children),
  )
}

export function WorkflowActionBar({ children, className, sticky = true, align = 'end' }) {
  if (typeof sharedUi.WorkflowActionBar === 'function') {
    return h(
      sharedUi.WorkflowActionBar,
      {
        className: ['ew-action-bar', className].filter(Boolean).join(' '),
        sticky,
        align,
      },
      children,
    )
  }

  const outerClassName = [
    'ew-action-bar',
    'presto-workflow-action-bar',
    sticky ? 'presto-workflow-action-bar--sticky' : null,
    className,
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ')

  const innerClassName = [
    'ew-action-bar-inner',
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

export function StatusPill({ tone = 'neutral', children }) {
  if (typeof sharedUi.Badge === 'function') {
    return h(sharedUi.Badge, { tone }, children)
  }
  return h('span', { className: ['ew-status-pill', `is-${tone}`].join(' ') }, children)
}

export function InlineError({ message }) {
  return message ? h('div', { className: 'ew-inline-error' }, message) : null
}

export function StatItem({ label, value }) {
  if (typeof sharedUi.StatChip === 'function') {
    return h(sharedUi.StatChip, { label, value: String(value) })
  }
  return h('div', { className: 'ew-stat-item' }, h('div', { className: 'ew-stat-label' }, label), h('div', { className: 'ew-stat-value' }, String(value)))
}

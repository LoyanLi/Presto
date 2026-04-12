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
  if (variant === 'tertiary') {
    return 'tertiary'
  }
  if (variant === 'danger') {
    return 'danger'
  }
  return 'secondary'
}

function normalizeSteps(steps) {
  return Array.isArray(steps)
    ? steps.map((step, index) =>
        typeof step === 'object' && step !== null && 'label' in step
          ? {
              id: step.id ?? index,
              label: step.label,
              hint: step.hint,
            }
          : {
              id: index,
              label: step,
            },
      )
    : []
}

export function WorkflowFrame({
  title,
  subtitle,
  eyebrow,
  metadata,
  actions,
  steps = [],
  currentStep = 1,
  children,
  footer,
  className,
}) {
  if (typeof sharedUi.WorkflowFrame === 'function') {
    return h(
      sharedUi.WorkflowFrame,
      {
        title,
        subtitle,
        eyebrow,
        metadata,
        actions,
        steps,
        currentStep,
        footer,
        className,
      },
      children,
    )
  }

  const normalizedSteps = normalizeSteps(steps)
  return h(
    'section',
    { className: ['presto-workflow-frame', className].filter(Boolean).join(' ') },
    title || subtitle || eyebrow || metadata || actions
      ? h(
          'header',
          { className: 'presto-workflow-frame__header' },
          h(
            'div',
            { className: 'presto-page-header' },
            h(
              'div',
              { className: 'presto-page-header__main' },
              eyebrow ? h('p', { className: 'ui-panel__eyebrow' }, eyebrow) : null,
              title ? h('h1', null, title) : null,
              subtitle ? h('p', null, subtitle) : null,
              metadata ? h('div', { className: 'presto-page-header__meta' }, metadata) : null,
            ),
            actions ? h('div', { className: 'presto-page-header__actions' }, actions) : null,
          ),
        )
      : null,
    normalizedSteps.length > 0
      ? h(
          'div',
          { className: 'presto-workflow-stepper presto-workflow-frame__steps' },
          h(
            'div',
            { className: 'presto-workflow-stepper__row' },
            normalizedSteps.map((step, index) => {
              const stepNumber = index + 1
              const state =
                stepNumber === currentStep ? 'presto-workflow-stepper__item--active' : stepNumber < currentStep ? 'presto-workflow-stepper__item--complete' : null
              return h(
                'div',
                {
                  key: step.id ?? stepNumber,
                  className: ['presto-workflow-stepper__item', state].filter(Boolean).join(' '),
                },
                h('span', { className: 'presto-workflow-stepper__index' }, String(stepNumber)),
                h(
                  'span',
                  { className: 'presto-workflow-stepper__label' },
                  step.label,
                ),
              )
            }),
          ),
        )
      : null,
    h('div', { className: 'presto-workflow-frame__body' }, children),
    footer ? h('footer', { className: 'presto-workflow-frame__footer' }, footer) : null,
  )
}

export function WorkflowCard({ title, subtitle, actions, children, className }) {
  if (typeof sharedUi.Panel === 'function') {
    return h(
      sharedUi.Panel,
      {
        title,
        description: subtitle,
        actions,
        className,
      },
      children,
    )
  }

  return h(
    'section',
    { className: ['ui-panel', className].filter(Boolean).join(' ') },
    title || subtitle || actions
      ? h(
          'header',
          { className: 'ui-panel__header' },
          h(
            'div',
            { className: 'ui-panel__header-main' },
            title ? h('h2', { className: 'ui-panel__title' }, title) : null,
            subtitle ? h('p', { className: 'ui-panel__description' }, subtitle) : null,
          ),
          actions ? h('div', { className: 'ui-panel__actions' }, actions) : null,
        )
      : null,
    h('div', { className: 'ui-panel__body' }, children),
  )
}

export function WorkflowActionBar({ children, className, align = 'end', sticky = true }) {
  if (typeof sharedUi.WorkflowActionBar === 'function') {
    return h(
      sharedUi.WorkflowActionBar,
      {
        className,
        align,
        sticky,
      },
      children,
    )
  }

  return h(
    'div',
    {
      className: [
        'presto-workflow-action-bar',
        sticky ? 'presto-workflow-action-bar--sticky' : null,
        className,
      ]
        .filter(Boolean)
        .join(' '),
    },
    h(
      'div',
      {
        className: [
          'presto-workflow-action-bar__inner',
          align === 'space-between' ? 'presto-workflow-action-bar__inner--space-between' : null,
          align === 'start' ? 'presto-workflow-action-bar__inner--start' : null,
        ]
          .filter(Boolean)
          .join(' '),
      },
      children,
    ),
  )
}

export function WorkflowButton({ variant = 'secondary', className, children, ...props }) {
  if (typeof sharedUi.Button === 'function') {
    return h(
      sharedUi.Button,
      {
        ...props,
        variant: toButtonVariant(variant),
        className,
      },
      children,
    )
  }

  return h(
    'button',
    {
      ...props,
      type: props.type ?? 'button',
      className: ['tm-button', `tm-button--${variant}`, className].filter(Boolean).join(' '),
    },
    children,
  )
}

export function WorkflowInput({ label, hint, error, className, ...props }) {
  if (typeof sharedUi.Input === 'function') {
    return h(sharedUi.Input, {
      ...props,
      label,
      hint,
      error,
      className,
    })
  }

  return h(
    'label',
    { className: ['tm-input', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'tm-input__label' }, label) : null,
    h('input', {
      ...props,
      className: 'tm-input__control',
    }),
    error ? h('span', { className: 'tm-input__hint tm-input__hint--error' }, error) : hint ? h('span', { className: 'tm-input__hint' }, hint) : null,
  )
}

export function StatusBadge({ tone = 'neutral', children }) {
  if (typeof sharedUi.Badge === 'function') {
    return h(sharedUi.Badge, { tone }, children)
  }

  return h('span', { className: ['tm-status-badge', `tm-status-badge--${tone}`].join(' ') }, children)
}

export function StatItem({ label, value }) {
  if (typeof sharedUi.StatChip === 'function') {
    return h(sharedUi.StatChip, { label, value: String(value) })
  }

  return h(
    'div',
    { className: 'tm-stat' },
    h('span', { className: 'tm-stat__label' }, label),
    h('strong', { className: 'tm-stat__value' }, String(value)),
  )
}

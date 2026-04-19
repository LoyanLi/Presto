import React from './react-shared.mjs'

const h = React.createElement

function resolveSharedUi() {
  const shared = globalThis.window?.__PRESTO_PLUGIN_SHARED__?.ui ?? globalThis.__PRESTO_PLUGIN_SHARED__?.ui
  if (!shared || typeof shared !== 'object') {
    return {}
  }
  return shared
}

const sharedUi = resolveSharedUi()

export function ToolPanel({ title, description, children, className }) {
  if (typeof sharedUi.Panel === 'function') {
    return h(
      sharedUi.Panel,
      {
        title,
        description,
        className,
      },
      children,
    )
  }

  return h(
    'section',
    { className: ['ui-panel', className].filter(Boolean).join(' ') },
    title || description
      ? h(
          'header',
          { className: 'ui-panel__header' },
          h(
            'div',
            { className: 'ui-panel__header-main' },
            title ? h('h2', { className: 'ui-panel__title' }, title) : null,
            description ? h('p', { className: 'ui-panel__description' }, description) : null,
          ),
        )
      : null,
    h('div', { className: 'ui-panel__body' }, children),
  )
}

export function ToolInput({ label, hint, className, ...props }) {
  if (typeof sharedUi.Input === 'function') {
    return h(sharedUi.Input, {
      ...props,
      label,
      hint,
      className,
    })
  }

  return h(
    'label',
    { className: ['tc-input', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'tc-input__label' }, label) : null,
    h('input', {
      ...props,
      className: 'tc-input__control',
    }),
    hint ? h('span', { className: 'tc-input__hint' }, hint) : null,
  )
}

export function ToolSelect({ label, options = [], className, ...props }) {
  if (typeof sharedUi.Select === 'function') {
    return h(sharedUi.Select, {
      ...props,
      label,
      options: options.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      className,
    })
  }

  return h(
    'label',
    { className: ['tc-input', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'tc-input__label' }, label) : null,
    h(
      'select',
      {
        ...props,
        className: 'tc-input__control',
      },
      options.map((option) =>
        h('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
  )
}

export function ToolStat({ label, value, className }) {
  if (typeof sharedUi.StatChip === 'function') {
    return h(sharedUi.StatChip, { label, value, className })
  }

  return h(
    'div',
    { className: ['tc-stat', className].filter(Boolean).join(' ') },
    h('span', { className: 'tc-stat__label' }, label),
    h('strong', { className: 'tc-stat__value' }, String(value)),
  )
}

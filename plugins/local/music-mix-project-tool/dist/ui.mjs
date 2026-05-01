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

export function ToolPanel({ title, description, actions, children, className }) {
  if (typeof sharedUi.Panel === 'function') {
    return h(sharedUi.Panel, { title, description, actions, className }, children)
  }

  return h(
    'section',
    { className: ['ui-panel', className].filter(Boolean).join(' ') },
    title || description || actions
      ? h(
          'header',
          { className: 'ui-panel__header' },
          h(
            'div',
            { className: 'ui-panel__header-main' },
            title ? h('h2', { className: 'ui-panel__title' }, title) : null,
            description ? h('p', { className: 'ui-panel__description' }, description) : null,
          ),
          actions ? h('div', { className: 'ui-panel__actions' }, actions) : null,
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
    { className: ['mmpt-input', className].filter(Boolean).join(' ') },
    label ? h('span', { className: 'mmpt-input__label' }, label) : null,
    h('input', {
      ...props,
      className: 'mmpt-input__control',
    }),
    hint ? h('span', { className: 'mmpt-input__hint' }, hint) : null,
  )
}

export function ToolButton({ children, className, ...props }) {
  if (typeof sharedUi.Button === 'function') {
    return h(sharedUi.Button, {
      ...props,
      className,
    }, children)
  }

  return h(
    'button',
    {
      ...props,
      type: props.type ?? 'button',
      className: ['mmpt-button', className].filter(Boolean).join(' '),
    },
    children,
  )
}

export function ToolStat({ label, value, className }) {
  if (typeof sharedUi.StatChip === 'function') {
    return h(sharedUi.StatChip, { label, value, className })
  }

  return h(
    'div',
    { className: ['mmpt-stat', className].filter(Boolean).join(' ') },
    h('span', { className: 'mmpt-stat__label' }, label),
    h('strong', { className: 'mmpt-stat__value' }, String(value)),
  )
}

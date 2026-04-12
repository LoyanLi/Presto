function createUnavailableReact() {
  const fail = () => {
    throw new Error('Atmos Video Mux Tool requires renderer-shared React via __PRESTO_PLUGIN_SHARED__.React.')
  }

  return new Proxy(
    {
      createElement: fail,
      useState: fail,
      useMemo: fail,
      useCallback: fail,
      useEffect: fail,
      Fragment: Symbol.for('react.fragment'),
    },
    {
      get(target, property) {
        if (property in target) {
          return target[property]
        }
        return fail
      },
    },
  )
}

const sharedReact = globalThis.window?.__PRESTO_PLUGIN_SHARED__?.React ?? globalThis.__PRESTO_PLUGIN_SHARED__?.React

const React = sharedReact && typeof sharedReact.createElement === 'function' ? sharedReact : createUnavailableReact()

export default React

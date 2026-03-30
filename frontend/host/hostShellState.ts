export type HostShellViewId = 'home' | 'workflows' | 'automation' | 'runs' | 'settings' | 'developer'

export interface HostShellState {
  shellViewId: HostShellViewId
}

export function createHostShellState(shellViewId: HostShellViewId = 'home'): HostShellState {
  const normalizedShellViewId: HostShellViewId =
    shellViewId === 'workflows' ||
    shellViewId === 'automation' ||
    shellViewId === 'runs' ||
    shellViewId === 'settings' ||
    shellViewId === 'developer'
      ? shellViewId
      : 'home'

  return {
    shellViewId: normalizedShellViewId,
  }
}

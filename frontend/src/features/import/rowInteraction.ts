export function shouldPreventRowMouseDown(target: EventTarget | { closest: (selector: string) => unknown } | null): boolean {
  if (!target || typeof target !== 'object' || typeof (target as { closest?: unknown }).closest !== 'function') {
    return false
  }

  const interactive = (target as { closest: (selector: string) => unknown }).closest('input, textarea, select, button, a, [contenteditable="true"]')
  return !interactive
}

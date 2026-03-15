type ComputeInput = {
  orderedPaths: string[]
  prevSelected: Set<string>
  prevAnchor: string | null
  clickedPath: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

type ComputeResult = {
  selected: Set<string>
  anchor: string | null
}

export function computeNextRowSelection(input: ComputeInput): ComputeResult {
  const {
    orderedPaths,
    prevSelected,
    prevAnchor,
    clickedPath,
    metaKey,
    ctrlKey,
    shiftKey,
  } = input

  const clickedIndex = orderedPaths.indexOf(clickedPath)
  if (clickedIndex < 0) {
    return { selected: prevSelected, anchor: prevAnchor }
  }

  const isToggleKey = metaKey || ctrlKey

  if (shiftKey) {
    const anchorPath = prevAnchor && orderedPaths.includes(prevAnchor) ? prevAnchor : clickedPath
    const anchorIndex = orderedPaths.indexOf(anchorPath)
    const start = Math.min(anchorIndex, clickedIndex)
    const end = Math.max(anchorIndex, clickedIndex)
    const rangeSet = new Set(orderedPaths.slice(start, end + 1))
    if (isToggleKey) {
      const merged = new Set(prevSelected)
      rangeSet.forEach((path) => merged.add(path))
      return { selected: merged, anchor: anchorPath }
    }
    return { selected: rangeSet, anchor: anchorPath }
  }

  if (isToggleKey) {
    const next = new Set(prevSelected)
    if (next.has(clickedPath)) {
      next.delete(clickedPath)
    } else {
      next.add(clickedPath)
    }
    return { selected: next, anchor: clickedPath }
  }

  if (prevSelected.size === 1 && prevSelected.has(clickedPath)) {
    return { selected: new Set(), anchor: null }
  }

  return { selected: new Set([clickedPath]), anchor: clickedPath }
}

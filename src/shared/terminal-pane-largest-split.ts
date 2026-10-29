import type { TerminalPaneLayoutNode } from './terminal-tab-types'

export type PaneSplitDirection = 'vertical' | 'horizontal'

type MeasuredLeaf = { leafId: string; width: number; height: number }

// Why: ratios are all the layout records, so panes are measured on a nominal 16:9 tab.
function measureLargest(node: TerminalPaneLayoutNode, width: number, height: number): MeasuredLeaf {
  if (node.type === 'leaf') {
    return { leafId: node.leafId, width, height }
  }
  const ratio = node.ratio ?? 0.5
  const [first, second] =
    node.direction === 'vertical'
      ? [
          measureLargest(node.first, width * ratio, height),
          measureLargest(node.second, width * (1 - ratio), height)
        ]
      : [
          measureLargest(node.first, width, height * ratio),
          measureLargest(node.second, width, height * (1 - ratio))
        ]
  return second.width * second.height > first.width * first.height ? second : first
}

/** The largest pane, split along its longer side (vertical = side by side). */
export function findLargestPaneSplit(root: TerminalPaneLayoutNode): {
  leafId: string
  direction: PaneSplitDirection
} {
  const largest = measureLargest(root, 16, 9)
  return {
    leafId: largest.leafId,
    direction: largest.width >= largest.height ? 'vertical' : 'horizontal'
  }
}

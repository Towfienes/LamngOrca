export function formatRelativeAge(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60_000)
  return min < 1 ? 'just now' : `${min}m ago`
}

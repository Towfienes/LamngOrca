/**
 * Lamng fork: Orca's release feed is upstream stablyai/orca, so an offered update would install
 * upstream over this fork's build. Built apps get the define; tests keep upstream behaviour.
 */
export function isLamngUpstreamUpdateBlocked(): boolean {
  return typeof ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES !== 'undefined'
    ? ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES
    : ((globalThis as { ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES?: boolean })
        .ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES ?? false)
}

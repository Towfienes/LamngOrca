import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import { joinRemotePath } from '../ssh/ssh-remote-platform'
import { throwIfAiVaultScanCancelled } from './ai-vault-scan-cancellation'
import { isMissingRemoteSessionPathError } from './remote-session-file-stat'
import type { RemoteScannerContext, RemoteSessionSource } from './remote-session-scanner-types'
import { dshProjcachePathForSessionLog, isDshSessionLogFile } from './session-scanner-dsh-paths'
import {
  decodeDshSessionLogBytes,
  parseDshProjcacheContent,
  parseDshSessionContent
} from './session-scanner-dsh-parser'
import type { FileWithMtime } from './session-scanner-types'

export function remoteDshSources(
  remoteHome: string,
  hostPlatform: RemoteHostPlatform
): RemoteSessionSource[] {
  const dshHome = joinRemotePath(hostPlatform, remoteHome, '.dsh')
  return [
    joinRemotePath(hostPlatform, dshHome, 'sessions'),
    // Same install's legacy root; it has no projcache beside it, so only a host
    // that can stream raw bytes lists these.
    joinRemotePath(hostPlatform, remoteHome, '.dsh-tui', 'sessions')
  ].map((rootDir) => ({
    agent: 'dsh' as const,
    rootDir,
    extensions: ['.zstd', '.jsonl'],
    directoryPredicate: (_name: string, depth: number) => depth <= 1,
    filePredicate: isDshSessionLogFile,
    // Why parseCandidate owns the read: the log is zstd-compressed, which a
    // text-only host cannot decode, while the session-list projection beside it
    // is plain JSON and carries the same cwd/title/timestamps.
    parseCandidate: async (file: FileWithMtime, context: RemoteScannerContext) => {
      const options = {
        executionHostId: context.executionHostId,
        executionHostPlatform: context.hostPlatform.os
      }
      const projcachePath = dshProjcachePathForSessionLog(file.path)
      if (projcachePath) {
        try {
          throwIfAiVaultScanCancelled(context.signal)
          const read = await context.provider.readFile(projcachePath)
          throwIfAiVaultScanCancelled(context.signal)
          if (!read.isBinary) {
            const session = parseDshProjcacheContent(
              file,
              read.content,
              context.hostPlatform.os,
              options
            )
            if (session) {
              return session
            }
          }
        } catch (error) {
          throwIfAiVaultScanCancelled(context.signal)
          if (!isMissingRemoteSessionPathError(error)) {
            throw error
          }
        }
      }
      if (!context.provider.readTranscriptBytes) {
        return null
      }
      const chunks: Buffer[] = []
      for await (const chunk of context.provider.readTranscriptBytes(file.path, context.signal)) {
        chunks.push(chunk)
      }
      return parseDshSessionContent(
        file,
        decodeDshSessionLogBytes(file.path, Buffer.concat(chunks)),
        context.hostPlatform.os,
        options
      )
    },
    // parseCandidate handles every read; a text-only body never arrives here
    // with the log's bytes.
    parse: async () => null
  }))
}

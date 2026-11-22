import { describe, expect, it, vi } from 'vitest'
import { createIdleLanguageServer } from './agent-typescript-lsp-idle.mjs'
import { resolveTypescriptLanguageServer } from './agent-typescript-lsp.mjs'

const uri = 'file:///repo/src/a.ts'
const IDLE_MS = 1000

function harness() {
  const client = []
  const servers = []
  const timers = new Map()
  let nextTimer = 0
  const onExit = vi.fn()
  const idle = createIdleLanguageServer({
    idleMs: IDLE_MS,
    toClient: (message) => client.push(message),
    onExit,
    setTimer: (run) => {
      timers.set(++nextTimer, run)
      return nextTimer
    },
    clearTimer: (id) => timers.delete(id),
    startServer: ({ onMessage, onExit: onServerExit }) => {
      const server = {
        written: [],
        ended: false,
        killed: false,
        reply: onMessage,
        exit: onServerExit,
        write: (message) => server.written.push(message),
        end: () => {
          server.ended = true
        },
        kill: () => {
          server.killed = true
        }
      }
      servers.push(server)
      return server
    }
  })
  const fireTimers = () => {
    const pending = [...timers.values()]
    timers.clear()
    pending.forEach((run) => run())
  }
  const boot = () => {
    idle.send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { rootUri: 'file:///repo' } })
    servers[0].reply({ jsonrpc: '2.0', id: 0, result: { capabilities: {} } })
    idle.send({ jsonrpc: '2.0', method: 'initialized', params: {} })
  }
  const open = (text = 'one\ntwo') =>
    idle.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, version: 1, languageId: 'typescript', text } }
    })
  const stopServer = () => {
    fireTimers()
    const shutdown = servers[0].written.find((message) => message.method === 'shutdown')
    servers[0].reply({ jsonrpc: '2.0', id: shutdown.id, result: null })
  }
  return { idle, client, servers, onExit, fireTimers, boot, open, stopServer }
}

const hover = (id) => ({
  jsonrpc: '2.0',
  id,
  method: 'textDocument/hover',
  params: { textDocument: { uri }, position: { line: 0, character: 0 } }
})

describe('idle TypeScript language server', () => {
  it('shuts the server down cleanly after the idle period', () => {
    const { servers, boot, stopServer } = harness()
    boot()
    stopServer()
    expect(servers[0].written.at(-1).method).toBe('exit')
    expect(servers[0].ended).toBe(true)
  })

  it('does not stop while a request is still running', () => {
    const { idle, servers, boot, fireTimers } = harness()
    boot()
    idle.send(hover(7))
    fireTimers()
    expect(servers[0].written.some((message) => message.method === 'shutdown')).toBe(false)
    servers[0].reply({ jsonrpc: '2.0', id: 7, result: null })
    fireTimers()
    expect(servers[0].written.some((message) => message.method === 'shutdown')).toBe(true)
  })

  it('restarts on the next request with the latest open documents, then answers it', () => {
    const { idle, client, servers, boot, open, stopServer } = harness()
    boot()
    open()
    idle.send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri, version: 2 },
        contentChanges: [
          {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
            text: 'TWO'
          }
        ]
      }
    })
    stopServer()
    expect(servers).toHaveLength(1)

    idle.send(hover(8))
    expect(servers).toHaveLength(2)
    const init = servers[1].written[0]
    expect(init.method).toBe('initialize')
    expect(init.params).toEqual({ rootUri: 'file:///repo' })
    expect(servers[1].written).toHaveLength(1)

    servers[1].reply({ jsonrpc: '2.0', id: init.id, result: { capabilities: {} } })
    expect(client.some((message) => message.id === init.id)).toBe(false)
    expect(servers[1].written.slice(1).map((message) => message.method)).toEqual([
      'initialized',
      'textDocument/didOpen',
      'textDocument/hover'
    ])
    expect(servers[1].written[2].params.textDocument).toEqual({
      uri,
      version: 2,
      languageId: 'typescript',
      text: 'one\nTWO'
    })

    servers[1].reply({ jsonrpc: '2.0', id: 8, result: { contents: 'ok' } })
    expect(client.at(-1)).toEqual({ jsonrpc: '2.0', id: 8, result: { contents: 'ok' } })
  })

  it('does not wake for file-watch noise or a closed document, and forgets that document', () => {
    const { idle, servers, boot, open, stopServer } = harness()
    boot()
    open()
    stopServer()
    idle.send({ jsonrpc: '2.0', method: 'workspace/didChangeWatchedFiles', params: { changes: [] } })
    idle.send({
      jsonrpc: '2.0',
      method: 'textDocument/didClose',
      params: { textDocument: { uri } }
    })
    expect(servers).toHaveLength(1)
    idle.send(hover(9))
    servers[1].reply({ jsonrpc: '2.0', id: servers[1].written[0].id, result: {} })
    expect(servers[1].written.some((message) => message.method === 'textDocument/didOpen')).toBe(
      false
    )
  })

  it('answers capability registration itself after a restart', () => {
    const { idle, client, servers, boot, stopServer } = harness()
    boot()
    stopServer()
    idle.send(hover(10))
    servers[1].reply({ jsonrpc: '2.0', id: servers[1].written[0].id, result: {} })
    const before = client.length
    servers[1].reply({ jsonrpc: '2.0', id: 'reg-1', method: 'client/registerCapability' })
    expect(client).toHaveLength(before)
    expect(servers[1].written).toContainEqual({ jsonrpc: '2.0', id: 'reg-1', result: null })
  })

  it('handles client shutdown and exit while stopped without starting a server', () => {
    const { idle, client, servers, onExit, boot, stopServer } = harness()
    boot()
    stopServer()
    idle.send({ jsonrpc: '2.0', id: 11, method: 'shutdown' })
    expect(client.at(-1)).toEqual({ jsonrpc: '2.0', id: 11, result: null })
    idle.send({ jsonrpc: '2.0', method: 'exit' })
    expect(onExit).toHaveBeenCalledWith(0)
    expect(servers).toHaveLength(1)
  })

  it('ignores the exit of a stopped server but reports an unexpected crash', () => {
    const { idle, servers, onExit, boot, stopServer } = harness()
    boot()
    stopServer()
    servers[0].exit(0, null)
    expect(onExit).not.toHaveBeenCalled()
    idle.send(hover(12))
    servers[1].exit(3, null)
    expect(onExit).toHaveBeenCalledWith(3)
  })

  it('force-kills a server that ignores shutdown', () => {
    const { servers, boot, fireTimers } = harness()
    boot()
    fireTimers()
    expect(servers[0].killed).toBe(false)
    fireTimers()
    expect(servers[0].killed).toBe(true)
  })
})

describe('TypeScript language server resource limits', () => {
  const resolve = (platform, env = {}) =>
    resolveTypescriptLanguageServer({ root: process.cwd(), env, platform, arch: 'x64' })

  it('caps memory and stops when idle only for tsc on Windows', () => {
    const windows = resolve('win32', { PATH: 'x' })
    expect(windows.server).toBe('tsc')
    expect(windows.env).toEqual({ PATH: 'x', GOMEMLIMIT: '4GiB' })
    expect(windows.idleStopMs).toBe(5 * 60_000)
  })

  it('keeps a memory limit the user already set', () => {
    expect(resolve('win32', { GOMEMLIMIT: '6GiB' }).env.GOMEMLIMIT).toBe('6GiB')
  })

  it('leaves Linux unchanged', () => {
    const linux = resolve('linux')
    expect(linux.server).toBe('tsrs')
    expect(linux.env).toBeUndefined()
    expect(linux.idleStopMs).toBeUndefined()
  })
})

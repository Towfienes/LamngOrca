import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { VSCodeBridge } from './vscode-bridge'

let bridge: VSCodeBridge | undefined
afterEach(() => bridge?.dispose())

describe('VS Code extension bridge', () => {
  it('authenticates the extension, routes saves and forwards actual dirty state', async () => {
    const onState = vi.fn()
    const onConnected = vi.fn()
    bridge = new VSCodeBridge(onConnected, onState)
    const endpoint = await bridge.listen()
    const socket = new WebSocket(endpoint)
    await new Promise<void>((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', paneId: 'pane' }))
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith('pane'))
    socket.on('message', (data) => {
      const request = JSON.parse(data.toString())
      expect(request.op).toBe('save')
      socket.send(
        JSON.stringify({ type: 'state', path: '/repo/test.py', dirty: false, content: 'saved' })
      )
      socket.send(JSON.stringify({ type: 'reply', requestId: request.requestId }))
    })
    await bridge.request('pane', { op: 'save', path: '/repo/test.py' })
    expect(onState).toHaveBeenCalledWith({
      type: 'state',
      paneId: 'pane',
      path: '/repo/test.py',
      dirty: false,
      content: 'saved'
    })
    socket.close()
  })

  it('rejects connections with no token or a browser Origin', async () => {
    bridge = new VSCodeBridge(vi.fn(), vi.fn())
    const endpoint = await bridge.listen()
    for (const [url, options] of [
      [endpoint.replace(/\/[a-f0-9]+$/, '/wrong'), {}],
      [endpoint, { origin: 'https://evil.invalid' }]
    ] as const) {
      const socket = new WebSocket(url, options)
      const error = await new Promise<Error>((resolve) => socket.once('error', resolve))
      expect(error.message).toContain('401')
    }
  })
})

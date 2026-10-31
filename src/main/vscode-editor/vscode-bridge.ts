import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { vscodeEditorSnapshotSchema, type VSCodeEditorSnapshot } from '../../shared/vscode-editor'

const helloSchema = z.object({ type: z.literal('hello'), paneId: z.string() })
const replySchema = z.object({
  type: z.literal('reply'),
  requestId: z.string(),
  error: z.string().optional()
})

export class VSCodeBridge {
  private readonly token = randomBytes(32).toString('hex')
  private server: WebSocketServer | null = null
  private sockets = new Map<string, WebSocket>()
  private requests = new Map<
    string,
    { socket: WebSocket; resolve: () => void; reject: (error: Error) => void }
  >()

  constructor(
    private readonly onConnected: (paneId: string) => void,
    private readonly onState: (state: VSCodeEditorSnapshot) => void
  ) {}

  async listen(): Promise<string> {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      maxPayload: 16 * 1024 * 1024,
      verifyClient: ({ origin, req }) => !origin && req.url === `/${this.token}`
    })
    this.server = server
    server.on('connection', (socket) => {
      let paneId: string | null = null
      socket.on('message', (data) => {
        let message: unknown
        try {
          message = JSON.parse(data.toString())
        } catch {
          socket.close()
          return
        }
        if (!paneId) {
          const hello = helloSchema.safeParse(message)
          if (!hello.success) {
            socket.close()
            return
          }
          paneId = hello.data.paneId
          this.sockets.get(paneId)?.close()
          this.sockets.set(paneId, socket)
          this.onConnected(paneId)
          return
        }
        const reply = replySchema.safeParse(message)
        if (reply.success) {
          const pending = this.requests.get(reply.data.requestId)
          if (!pending || pending.socket !== socket) {
            return
          }
          this.requests.delete(reply.data.requestId)
          if (reply.data.error) {
            pending.reject(new Error(reply.data.error))
          } else {
            pending.resolve()
          }
          return
        }
        const state = vscodeEditorSnapshotSchema.safeParse(message)
        if (state.success) {
          this.onState({ ...state.data, paneId })
        }
      })
      socket.on('close', () => {
        if (paneId && this.sockets.get(paneId) === socket) {
          this.sockets.delete(paneId)
        }
        for (const [id, pending] of this.requests) {
          if (pending.socket !== socket) {
            continue
          }
          this.requests.delete(id)
          pending.reject(
            new Error('VS Code disconnected. Reopen the editor to recover unsaved changes.')
          )
        }
      })
      socket.on('error', () => socket.close())
    })
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('VS Code bridge did not start.')
    }
    return `ws://127.0.0.1:${address.port}/${this.token}`
  }

  connected(paneId: string): boolean {
    return this.sockets.get(paneId)?.readyState === WebSocket.OPEN
  }

  async request(paneId: string, command: Record<string, unknown>): Promise<void> {
    const socket = this.sockets.get(paneId)
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('VS Code is still starting. Reopen the editor if it stays disconnected.')
    }
    const requestId = randomUUID()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        this.requests.set(requestId, { socket, resolve, reject })
        timer = setTimeout(() => {
          this.requests.delete(requestId)
          reject(new Error('VS Code did not finish the operation. Check the editor for a dialog.'))
        }, 30_000)
        socket.send(JSON.stringify({ ...command, requestId }))
      })
    } finally {
      clearTimeout(timer)
    }
  }

  dispose(): void {
    for (const socket of this.server?.clients ?? []) {
      socket.terminate()
    }
    this.server?.close()
    this.server = null
  }
}

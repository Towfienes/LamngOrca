// Stops a heavy language server while the agent is idle; the client keeps one continuous session.
const STOP_TIMEOUT_MS = 5_000
const DOCUMENT_SYNC = new Set([
  'textDocument/didOpen',
  'textDocument/didChange',
  'textDocument/didClose'
])
const WAKE_NOTIFICATIONS = new Set([
  'textDocument/didOpen',
  'textDocument/didChange',
  'textDocument/didSave'
])
const REGISTRATIONS = new Set(['client/registerCapability', 'client/unregisterCapability'])

function positionOffset(text, { line, character }) {
  let start = 0
  for (let current = 0; current < line; current++) {
    const newline = text.indexOf('\n', start)
    if (newline === -1) {
      return text.length
    }
    start = newline + 1
  }
  return Math.min(start + character, text.length)
}

function applyContentChange(text, change) {
  if (!change.range) {
    return change.text
  }
  const start = positionOffset(text, change.range.start)
  const end = positionOffset(text, change.range.end)
  return `${text.slice(0, start)}${change.text}${text.slice(end)}`
}

export function createIdleLanguageServer({
  idleMs,
  startServer,
  toClient,
  onExit,
  stopTimeoutMs = STOP_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const documents = new Map()
  const pending = new Set()
  let initializeParams
  let configuration = null
  let server = null
  let retire = null
  let ready = false
  let started = false
  let queue = []
  let idleTimer
  let nextInternalId = 0

  const armIdle = () => {
    clearTimer(idleTimer)
    idleTimer = undefined
    if (server && ready && pending.size === 0) {
      idleTimer = setTimer(stop, idleMs)
    }
  }

  function stop() {
    idleTimer = undefined
    if (!server || !ready || pending.size > 0) {
      return
    }
    retire()
    server = null
    retire = null
    ready = false
  }

  const finishRestart = (current) => {
    ready = true
    current.write({ jsonrpc: '2.0', method: 'initialized', params: {} })
    if (configuration) {
      current.write({
        jsonrpc: '2.0',
        method: 'workspace/didChangeConfiguration',
        params: configuration
      })
    }
    for (const textDocument of documents.values()) {
      current.write({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { ...textDocument } }
      })
    }
    const queued = queue
    queue = []
    queued.forEach((message) => current.write(message))
    armIdle()
  }

  const start = () => {
    const restarted = started
    started = true
    let replayId = restarted ? `orca-idle-initialize-${++nextInternalId}` : null
    let stopId = null
    let killTimer
    const current = startServer({
      onMessage: (message) => {
        if (stopId !== null) {
          if (message.id === stopId && !message.method) {
            clearTimer(killTimer)
            current.write({ jsonrpc: '2.0', method: 'exit' })
            current.end()
          }
          return
        }
        if (replayId !== null && message.id === replayId && !message.method) {
          replayId = null
          finishRestart(current)
          return
        }
        if (restarted && REGISTRATIONS.has(message.method)) {
          // Why: the client already holds these registrations from the first server.
          current.write({ jsonrpc: '2.0', id: message.id, result: null })
          return
        }
        if (message.id !== undefined && !message.method) {
          pending.delete(message.id)
          toClient(message)
          armIdle()
          return
        }
        toClient(message)
      },
      onExit: (code, signal) => {
        clearTimer(killTimer)
        if (current === server) {
          onExit(code ?? (signal ? 1 : 0))
        }
      }
    })
    server = current
    retire = () => {
      stopId = `orca-idle-shutdown-${++nextInternalId}`
      killTimer = setTimer(() => current.kill(), stopTimeoutMs)
      current.write({ jsonrpc: '2.0', id: stopId, method: 'shutdown' })
    }
    ready = !restarted
    if (restarted) {
      current.write({
        jsonrpc: '2.0',
        id: replayId,
        method: 'initialize',
        params: initializeParams
      })
    }
  }

  const track = ({ method, params }) => {
    if (method === 'initialize') {
      initializeParams = params
    } else if (method === 'workspace/didChangeConfiguration') {
      configuration = params
    } else if (method === 'textDocument/didOpen') {
      documents.set(params.textDocument.uri, { ...params.textDocument })
    } else if (method === 'textDocument/didClose') {
      documents.delete(params.textDocument.uri)
    } else if (method === 'textDocument/didChange') {
      const document = documents.get(params.textDocument.uri)
      if (document) {
        document.version = params.textDocument.version ?? document.version
        document.text = params.contentChanges.reduce(applyContentChange, document.text)
      }
    }
  }

  return {
    send(message) {
      const { id, method } = message
      track(message)
      const isRequest = id !== undefined && method !== undefined
      if (!server) {
        if (method === 'shutdown') {
          toClient({ jsonrpc: '2.0', id, result: null })
          return
        }
        if (method === 'exit') {
          onExit(0)
          return
        }
        if (!isRequest && !WAKE_NOTIFICATIONS.has(method)) {
          return
        }
        start()
      }
      if (isRequest) {
        pending.add(id)
      }
      if (ready) {
        server.write(message)
      } else if (!DOCUMENT_SYNC.has(method)) {
        // Why: open documents are replayed from `documents` once the new server is initialized.
        queue.push(message)
      }
      armIdle()
    },
    close() {
      if (server) {
        server.end()
      } else {
        onExit(0)
      }
    },
    kill(signal) {
      if (server) {
        server.kill(signal)
      } else {
        onExit(0)
      }
    }
  }
}

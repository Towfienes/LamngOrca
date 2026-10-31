const vscode = require('vscode')
const { basename } = require('node:path')

exports.activate = async (context) => {
  const workspace = vscode.workspace.workspaceFile
  const endpoint = process.env.ORCA_VSCODE_BRIDGE
  if (!endpoint || !workspace) {
    return
  }
  const paneId = basename(workspace.fsPath, '.code-workspace')
  const socket = new WebSocket(endpoint)
  let disposed = false
  let timer
  let configured = false
  let suppressActivation = false
  let operations = Promise.resolve()
  const textVersions = new Map()
  const notebookDirty = new Map()
  const send = (value) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(value))
    }
  }
  const reportText = (document, active = false) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'vscode-remote') {
      return
    }
    const path = document.uri.fsPath
    const version = `${document.version}:${document.isDirty}`
    if (!active && textVersions.get(path) === version) {
      return
    }
    textVersions.set(path, version)
    send({
      type: 'state',
      path: document.uri.fsPath,
      dirty: document.isDirty,
      content: document.getText(),
      active
    })
  }
  const reportNotebook = (document, active = false) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }
    const path = document.uri.fsPath
    if (!active && notebookDirty.get(path) === document.isDirty) {
      return
    }
    notebookDirty.set(path, document.isDirty)
    send({ type: 'state', path: document.uri.fsPath, dirty: document.isDirty, active })
  }
  const report = () => {
    for (const document of vscode.workspace.textDocuments) {
      reportText(document)
    }
    for (const document of vscode.workspace.notebookDocuments) {
      reportNotebook(document)
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(report, 50)
  }
  const findDocument = (path) =>
    vscode.workspace.notebookDocuments.find((doc) => doc.uri.fsPath === path) ??
    vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === path)

  socket.addEventListener('open', () => {
    send({ type: 'hello', paneId })
    report()
  })
  const handleMessage = async (event) => {
    let request
    try {
      request = JSON.parse(event.data)
      if (request.op === 'open') {
        if (!configured) {
          for (const [key, value] of Object.entries(request.settings || {})) {
            if (vscode.workspace.getConfiguration().inspect(key)?.defaultValue === undefined) {
              continue
            }
            await vscode.workspace
              .getConfiguration()
              .update(key, value, vscode.ConfigurationTarget.Global)
          }
          // Orca owns navigation; never request browser fullscreen while entering Zen mode.
          await vscode.commands.executeCommand('workbench.action.toggleZenMode')
          configured = true
        }
        const uri = vscode.Uri.file(request.path)
        await vscode.commands.executeCommand('vscode.open', uri, {
          preview: false,
          preserveFocus: true
        })
        if (request.background && request.foreground) {
          const colors = vscode.workspace
            .getConfiguration('workbench')
            .get('colorCustomizations', {})
          await vscode.workspace.getConfiguration('workbench').update(
            'colorCustomizations',
            {
              ...colors,
              'editor.background': request.background,
              'editor.foreground': request.foreground,
              'editorGutter.background': request.background,
              'notebook.editorBackground': request.background,
              'notebook.cellEditorBackground': request.background,
              'sideBar.background': request.background,
              'panel.background': request.background
            },
            vscode.ConfigurationTarget.Global
          )
        }
      } else if (request.op === 'save') {
        const document = findDocument(request.path)
        if (!document) {
          throw new Error('Reopen this file in the editor before saving.')
        }
        if (!(await document.save())) {
          throw new Error('VS Code could not save the file.')
        }
      } else if (request.op === 'discard') {
        suppressActivation = true
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(request.path), {
          preserveFocus: true
        })
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor')
      } else {
        throw new Error('Unknown Orca editor operation.')
      }
      if (request.op === 'open') {
        const document = findDocument(request.path)
        if (document) {
          if (typeof document.getText === 'function') {
            reportText(document, true)
          } else {
            reportNotebook(document, true)
          }
        }
      }
      report()
      send({ type: 'reply', requestId: request.requestId })
    } catch (error) {
      send({ type: 'reply', requestId: request?.requestId, error: String(error.message || error) })
    } finally {
      suppressActivation = false
    }
  }
  socket.addEventListener('message', (event) => {
    operations = operations.then(() => handleMessage(event))
  })
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(schedule),
    vscode.workspace.onDidSaveTextDocument(reportText),
    vscode.workspace.onDidCloseTextDocument((document) => textVersions.delete(document.uri.fsPath)),
    vscode.workspace.onDidCloseNotebookDocument((document) => {
      notebookDirty.delete(document.uri.fsPath)
    }),
    vscode.workspace.onDidChangeNotebookDocument(schedule),
    vscode.workspace.onDidSaveNotebookDocument(reportNotebook),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && !suppressActivation) {
        reportText(editor.document, true)
      }
    }),
    vscode.window.onDidChangeActiveNotebookEditor((editor) => {
      if (editor && !suppressActivation) {
        reportNotebook(editor.notebook, true)
      }
    }),
    {
      dispose() {
        disposed = true
        clearTimeout(timer)
        socket.close()
      }
    }
  )
  if (!disposed) {
    schedule()
  }
}

import { useEffect, useRef, useState } from 'react'
import { FileCode2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { VSCodeEditorHandle } from '../../../../shared/vscode-editor'
import { VSCODE_EDITOR_PARTITION } from '../../../../shared/vscode-editor'
import {
  subscribeVSCodeEditorState,
  vscodeEditorSessions,
  vscodeEditorContexts
} from './vscode-editor-sessions'
import { browserColorProbe } from '@/lib/plugin-theme-tokens'
import { translate } from '@/i18n/i18n'

function hexColor(value: string): string | null {
  const channels = browserColorProbe(value)
  if (!channels) {
    return null
  }
  const [r, g, b] = channels
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`
}

export default function VSCodeEditor({
  file,
  paneKey,
  rootPath,
  viewId,
  groupId,
  onUseOrca
}: {
  file: OpenFile
  paneKey: string
  rootPath: string
  viewId: string
  groupId: string
  onUseOrca: () => void
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const currentHandle = useRef<VSCodeEditorHandle | null>(null)
  const webview = useRef<Electron.WebviewTag>(null)
  const [titleInset, setTitleInset] = useState(0)
  const [handle, setHandle] = useState<VSCodeEditorHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const theme = useAppStore((state) => state.settings?.theme)
  useEffect(() => {
    subscribeVSCodeEditorState()
    let mounted = true
    setReady(false)
    setError(null)
    const style = getComputedStyle(root.current ?? document.documentElement)
    const swatch = document.createElement('span')
    swatch.style.color = style.getPropertyValue('--workspace-canvas').trim()
    document.body.append(swatch)
    const background = hexColor(getComputedStyle(swatch).color)
    swatch.style.color = style.getPropertyValue('--foreground').trim()
    const foreground = hexColor(getComputedStyle(swatch).color)
    swatch.remove()
    if (!background || !foreground) {
      setError(
        translate('vscodeEditor.themeError', 'The editor theme color could not be resolved.')
      )
      return
    }
    const unsubscribe = window.api.vscodeEditor.onState((state) => {
      if (mounted && state.path === file.filePath && state.error) {
        setError(state.error)
        setReady(false)
        return
      }
      if (mounted && state.path === file.filePath) {
        setReady(true)
        clearTimeout(timer)
      }
    })
    const timer = setTimeout(() => {
      if (mounted) {
        setError(
          translate(
            'vscodeEditor.slowStart',
            'VS Code is taking longer than expected. Check the editor for a workspace trust dialog, or retry.'
          )
        )
      }
    }, 45_000)
    void window.api.vscodeEditor
      .open({ paneKey, rootPath, filePath: file.filePath, background, foreground, viewId })
      .then((next) => {
        if (!mounted) {
          return
        }
        currentHandle.current = next
        vscodeEditorSessions.set(file.filePath, { id: next.id })
        vscodeEditorContexts.set(next.id, {
          worktreeId: file.worktreeId,
          groupId,
          rootPath,
          filePath: file.filePath
        })
        setHandle(next)
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : translate('vscodeEditor.startFailed', 'VS Code could not start.')
          )
        }
      })
    return () => {
      mounted = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [file.filePath, file.worktreeId, groupId, paneKey, rootPath, retry, theme, viewId])
  useEffect(
    () => () => {
      const current = currentHandle.current
      if (current) {
        vscodeEditorContexts.delete(current.id)
        void window.api.vscodeEditor.release(current.id)
      }
    },
    []
  )
  useEffect(() => {
    if (!ready || !webview.current) {
      return
    }
    let mounted = true
    void webview.current
      .executeJavaScript(`(() => {
      const title = document.querySelector('.part.titlebar');
      const rect = title?.getBoundingClientRect();
      if (rect && rect.top === 0) { title.inert = true; title.setAttribute('aria-hidden', 'true'); }
      return rect && rect.top === 0 ? rect.height * devicePixelRatio : 0;
    })()`)
      .then((height: number) => {
        if (mounted && Number.isFinite(height)) {
          setTitleInset(height / window.devicePixelRatio)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [ready, handle?.id, retry])

  return (
    <div
      ref={root}
      className="flex min-h-0 flex-1 flex-col bg-workspace-canvas text-foreground"
      data-vscode-editor
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs text-muted-foreground">
        <FileCode2 className="size-4" />
        <span className="truncate">{file.relativePath}</span>
        {file.isDirty && (
          <span aria-label={translate('vscodeEditor.unsaved', 'Unsaved changes')}>●</span>
        )}
        <span className="ml-auto">{translate('vscodeEditor.name', 'VS Code')}</span>
      </div>
      {!ready && !error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          {translate('vscodeEditor.starting', 'Starting VS Code…')}
        </div>
      )}
      {error && !ready && (
        <div role="alert" className="space-y-2 px-3 py-2 text-sm">
          <p>{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setHandle(null)
              setRetry((value) => value + 1)
            }}
          >
            {translate('vscodeEditor.retry', 'Retry')}
          </Button>
          <Button variant="ghost" size="sm" disabled={file.isDirty} onClick={onUseOrca}>
            {translate('vscodeEditor.useOrca', 'Use Orca editor')}
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden" data-vscode-editor-viewport>
        {handle && (
          <webview
            ref={webview}
            key={handle.id + retry}
            src={handle.url}
            partition={VSCODE_EDITOR_PARTITION}
            className="absolute inset-x-0 w-full"
            style={{
              top: -titleInset,
              height: `calc(100% + ${titleInset}px)`,
              visibility: ready || error ? 'visible' : 'hidden'
            }}
            data-vscode-editor-guest
          />
        )}
      </div>
    </div>
  )
}

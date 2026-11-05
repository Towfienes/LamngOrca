import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeWorkspaceFilePaths,
  writeWorkspaceFileDesktopDrag,
  getWorkspaceFileDragPaths,
  readWorkspaceFileDragPaths,
  WORKSPACE_FILE_PATH_MIME
} from '@/lib/workspace-file-drag'

describe('decodeWorkspaceFilePaths', () => {
  it('filters out non-string entries from a JSON array', () => {
    expect(decodeWorkspaceFilePaths(JSON.stringify(['/repo/a.ts', 42, null]))).toEqual([
      '/repo/a.ts'
    ])
  })
})

describe('getWorkspaceFileDragPaths', () => {
  it('fails closed when the drag payload exceeds the bounded decoder limits', () => {
    const oversizedPath = `C:\\Users\\alice\\${'s'.repeat(260 * 1024)}`

    expect(
      getWorkspaceFileDragPaths({
        getData: (type) => (type === WORKSPACE_FILE_PATH_MIME ? oversizedPath : '')
      })
    ).toEqual([])
  })
})

describe('readWorkspaceFileDragPaths', () => {
  it('rejects raw path payloads before parsing or normalizing oversized data', () => {
    const result = readWorkspaceFileDragPaths(
      {
        getData: (type) => (type === WORKSPACE_FILE_PATH_MIME ? 'C:\\Users\\alice\\secret' : '')
      },
      { maxPathBytes: 4 }
    )

    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.reason).toBe('paths-too-large')
      expect(result.pathCount).toBe(0)
      expect(result.byteLength).toBeGreaterThan(4)
      expect(JSON.stringify(result)).not.toContain('alice')
      expect(JSON.stringify(result)).not.toContain('secret')
    }
  })
})

describe('desktop file drag formats', () => {
  afterEach(() => vi.unstubAllGlobals())

  const source = { executionHostId: 'local' as const, isDirectory: false, name: 'notes #1.ipynb' }

  it('adds standard file data without removing internal ownership or paths', () => {
    const data = new Map([['text/x-orca-file-path', '/repo/notes #1.ipynb']])
    writeWorkspaceFileDesktopDrag(
      {
        setData: (type, value) => {
          data.set(type, value)
        }
      },
      ['/repo/notes #1.ipynb'],
      source
    )
    expect(data.get('text/x-orca-file-path')).toBe('/repo/notes #1.ipynb')
    expect(data.get('text/uri-list')).toBe('file:///repo/notes%20%231.ipynb')
    expect(data.get('DownloadURL')).toBe(
      'application/octet-stream:notes #1.ipynb:file:///repo/notes%20%231.ipynb'
    )
  })

  it.each([
    ['C:\\Users\\me\\notes #1.ipynb', 'file:///C:/Users/me/notes%20%231.ipynb'],
    ['\\\\server\\share\\notes #1.ipynb', 'file://server/share/notes%20%231.ipynb'],
    ['/repo/back\\slash.ipynb', 'file:///repo/back%5Cslash.ipynb']
  ])('encodes platform paths %s', (path, expected) => {
    const setData = vi.fn()
    writeWorkspaceFileDesktopDrag({ setData }, [path], source)
    expect(setData).toHaveBeenCalledWith('text/uri-list', expected)
  })

  it('exports all selected URIs without silently exporting only the first file', () => {
    const setData = vi.fn()
    writeWorkspaceFileDesktopDrag({ setData }, ['/repo/a', '/repo/b'], source)
    expect(setData).toHaveBeenCalledExactlyOnceWith(
      'text/uri-list',
      'file:///repo/a\r\nfile:///repo/b'
    )
  })

  it('does not describe folders as downloadable files', () => {
    const setData = vi.fn()
    writeWorkspaceFileDesktopDrag({ setData }, ['/repo/folder'], { ...source, isDirectory: true })
    expect(setData).toHaveBeenCalledExactlyOnceWith('text/uri-list', 'file:///repo/folder')
  })

  it('does not leak remote, unresolved, or browser runtime paths to desktop', () => {
    const setData = vi.fn()
    writeWorkspaceFileDesktopDrag({ setData }, ['/repo/a'], {
      ...source,
      executionHostId: 'ssh:host'
    })
    writeWorkspaceFileDesktopDrag({ setData }, ['/repo/a'], {
      ...source,
      executionHostId: undefined
    })
    vi.stubGlobal('__ORCA_WEB_CLIENT__', true)
    writeWorkspaceFileDesktopDrag({ setData }, ['/repo/a'], source)
    expect(setData).not.toHaveBeenCalled()
  })

  it.each(
    [
      [],
      ['relative/path'],
      ['/repo/a\nfile:///other'],
      ['/repo/a\0b'],
      Array(257).fill('/repo/a'),
      [`/${'a'.repeat(256 * 1024)}`]
    ].map((paths) => [paths])
  )('rejects invalid or oversized paths', (paths) => {
    const setData = vi.fn()
    writeWorkspaceFileDesktopDrag({ setData }, paths, source)
    expect(setData).not.toHaveBeenCalled()
  })
})

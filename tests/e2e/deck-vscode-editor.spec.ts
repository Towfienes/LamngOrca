import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraEnv: {
    ORCA_VSCODE_RUNTIME_DIR:
      process.env.ORCA_VSCODE_RUNTIME_DIR || join(process.env.HOME || '', '.config/orca-vscode')
  },
  orcaAppExtraArgs: process.platform === 'linux' ? ['--ozone-platform=headless'] : []
})

test('folder Quick Launch opens actual VS Code, remembers its shortcut and restores after reload', async ({
  orcaPage: page,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(180_000)
  const rootPath = mkdtempSync(join(tmpdir(), 'orca-vscode-folder-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(rootPath, { recursive: true, force: true })
  )
  const filePath = join(rootPath, 'folder.py')
  writeFileSync(filePath, 'print("folder workspace")\n')
  writeFileSync(join(rootPath, 'second.py'), 'print("workspace three")\n')
  await waitForSessionReady(page)
  const workspaceId = await page.evaluate(
    async ({ rootPath }) => {
      const state = window.__store!.getState()
      const group = await state.createProjectGroup('VS Code', 'local')
      if (!group) {
        throw new Error('Project group was not created')
      }
      const folder = await state.createFolderWorkspace(
        { projectGroupId: group.id, folderPath: rootPath },
        { runtimeEnvironmentId: null }
      )
      if (!folder) {
        throw new Error('Folder workspace was not created')
      }
      state.setActiveFolderWorkspace(folder.id)
      state.setActiveView('terminal')
      if (state.sidebarOpen) {
        state.toggleSidebar()
      }
      if (state.rightSidebarOpen) {
        state.toggleRightSidebar()
      }
      const workspaceId = `folder:${folder.id}`
      return workspaceId
    },
    { rootPath }
  )
  const launch = page.locator('[data-workspace-quick-launch]')
  const shortcut = launch.getByRole('button', { name: 'VS Code', exact: true })
  await expect(shortcut).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator('[data-vscode-editor-guest]')).toHaveCount(0)
  await shortcut.click()
  const picker = page.getByRole('dialog', { name: 'Go to file', exact: true })
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(launch).toBeVisible()
  expect(
    await page.evaluate(
      (id) => window.__store!.getState().tabsByWorktree[id]?.length ?? 0,
      workspaceId
    )
  ).toBe(0)
  await launch.getByRole('button', { name: 'Customize', exact: true }).click()
  await page
    .getByText('VS Code', { exact: true })
    .last()
    .locator('..')
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(shortcut).toHaveCount(0)
  await page.reload()
  await waitForSessionReady(page)
  await expect(launch).toBeVisible()
  await expect(shortcut).toHaveCount(0)
  await launch.getByRole('button', { name: 'Customize', exact: true }).click()
  await page.getByRole('button', { name: 'VS Code', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(shortcut).toBeEnabled()
  await shortcut.click()
  await picker.getByRole('combobox').fill('folder.py')
  await picker.getByRole('option').filter({ hasText: 'folder.py' }).click()
  await expect(launch).toHaveCount(0)
  await expect(page.locator('[data-vscode-editor-guest]')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Starting VS Code…', { exact: true })).toHaveCount(0, {
    timeout: 60_000
  })
  await expect
    .poll(
      () =>
        page.evaluate(
          async (id) => (await window.api.session.get()).openFilesByWorktree?.[id]?.length ?? 0,
          workspaceId
        ),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0)
  await page.reload()
  await waitForSessionReady(page)
  await expect(page.locator('[data-vscode-editor-guest]')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Starting VS Code…', { exact: true })).toHaveCount(0, {
    timeout: 60_000
  })
  const id = await page.evaluate(() =>
    document.querySelector<Electron.WebviewTag>('[data-vscode-editor-guest]')?.getWebContentsId()
  )
  if (!id) {
    throw new Error('Restored guest is missing')
  }
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)
              ?.executeJavaScript('document.body.innerText.replaceAll("\\u00a0", " ")'),
          id
        ),
      { timeout: 30_000 }
    )
    .toContain('folder workspace')
  for (const width of [390, 768, 1440]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900),
      width
    )
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('[data-vscode-editor]')).toBeVisible()
    const geometry = await page.locator('[data-vscode-editor]').evaluate((element) => ({
      width: element.clientWidth,
      overflow: element.scrollWidth > element.clientWidth
    }))
    expect(geometry.width).toBeGreaterThan(100)
    expect(geometry.overflow).toBe(false)
    const capture = await electronApp.evaluate(async ({ BrowserWindow, webContents }, id) => {
      await webContents.fromId(id)?.capturePage(undefined, { stayHidden: true, stayAwake: true })
      return (
        await BrowserWindow.getAllWindows()[0]!.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true
        })
      )
        .toPNG()
        .toString('base64')
    }, id)
    writeFileSync(
      testInfo.outputPath(`restored-vscode-${width}.png`),
      Buffer.from(capture, 'base64')
    )
  }
  const workspaceSlots = page
    .getByRole('group', { name: 'Workspace tabs' })
    .locator('button.deck-tab-dot')
  await workspaceSlots.nth(2).click()
  await page
    .locator('[data-workspace-quick-launch]')
    .getByRole('button', { name: 'VS Code', exact: true })
    .click()
  const nextFile = page.getByRole('dialog', { name: 'Go to file', exact: true })
  await nextFile.getByRole('combobox').fill('second.py')
  await nextFile.getByRole('option').filter({ hasText: 'second.py' }).click()
  await expect(workspaceSlots.nth(1)).toHaveAttribute('data-empty', 'true')
  await expect(workspaceSlots.nth(2)).toHaveAttribute('aria-current', 'true')
  await expect(workspaceSlots.nth(2).locator('[data-vscode-workspace-icon]')).toHaveCount(1)
  await workspaceSlots.nth(2).click({ button: 'middle' })
  await expect(workspaceSlots.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)
              ?.executeJavaScript('document.body.innerText.replaceAll("\\u00a0", " ")'),
          id
        ),
      { timeout: 30_000 }
    )
    .toContain('folder workspace')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const file = window
          .__store!.getState()
          .openFiles.find((file) => file.relativePath === 'folder.py')
        if (!file) {
          reject(new Error('Original editor file is missing'))
          return
        }
        window.dispatchEvent(
          new CustomEvent('orca:editor-save-file', {
            detail: { fileId: file.id, claim: () => {}, resolve, reject }
          })
        )
      })
  )
  await electronApp.evaluate(({ BrowserWindow }, path) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('vscodeEditor:state', {
      type: 'state',
      paneId: 'fallback-test',
      path,
      dirty: false,
      error: 'Test editor recovery'
    })
  }, filePath)
  await page.getByRole('button', { name: 'Use Orca editor', exact: true }).click()
  await expect(page.locator('[data-vscode-editor-guest]')).toHaveCount(0)
  await expect
    .poll(() => electronApp.evaluate(({ webContents }, id) => !webContents.fromId(id), id))
    .toBe(true)
  await expect(page.locator('[data-vscode-workspace-icon]')).toHaveCount(0)
})

test('actual VS Code edits and saves from an Orca pane and opens its notebook editor without tabs', async ({
  orcaPage: page,
  electronApp,
  testRepoPath
}, testInfo) => {
  test.setTimeout(180_000)
  const pythonPath = join(testRepoPath, 'orca-editor-test.py')
  const notebookPath = join(testRepoPath, 'orca-editor-test.ipynb')
  const markdownPath = join(testRepoPath, 'orca-editor-test.md')
  writeFileSync(markdownPath, '# Native Orca Markdown\n')
  writeFileSync(pythonPath, 'print("hello Orca")\n')
  writeFileSync(
    notebookPath,
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
      cells: [
        {
          id: 'test-cell',
          cell_type: 'code',
          metadata: {},
          source: ['print(6 * 7)'],
          execution_count: null,
          outputs: []
        }
      ]
    })
  )
  await waitForSessionReady(page)
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900)
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  const worktreeId = await waitForActiveWorktree(page)
  await page.evaluate(
    ({ worktreeId, pythonPath }) => {
      const state = window.__store!.getState()
      state.dismissUsagePercentageDisplayChangeNotice()
      state.markCodexTerminalServerIsolationNoticeSeen()
      void state.updateSettingsOrThrow({ theme: 'dark', editorAutoSave: false })
      state.openFile({
        filePath: pythonPath,
        relativePath: 'orca-editor-test.py',
        worktreeId,
        language: 'python',
        mode: 'edit'
      })
    },
    { worktreeId, pythonPath }
  )
  await expect(page.locator('[data-vscode-editor-guest]')).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(
      async () =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((c) => c.getType() === 'webview')
            .map((c) => c.id)
        ),
      { timeout: 30_000 }
    )
    .not.toEqual([])
  const getGuest = async () =>
    electronApp.evaluate(
      ({ webContents }) =>
        webContents
          .getAllWebContents()
          .find((c) => c.getType() === 'webview' && c.getURL().startsWith('http://127.0.0.1:'))
          ?.id ?? null
    )
  await expect.poll(getGuest, { timeout: 30_000 }).not.toBeNull()
  const guestId = await getGuest()
  if (!guestId) {
    throw new Error('No VS Code guest')
  }
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)
              ?.executeJavaScript('document.body.innerText.replaceAll("\\u00a0", " ")'),
          guestId
        ),
      { timeout: 60_000 }
    )
    .toContain('hello Orca')
  await electronApp.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id)
    await guest?.executeJavaScript(`(() => {
      const input = document.querySelector('.monaco-editor [role="textbox"]') || document.querySelector('.monaco-editor textarea');
      if (!input) throw new Error('VS Code editable input not ready');
      input.focus();
    })()`)
    guest?.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] })
    guest?.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] })
    await guest?.insertText('\n# saved from actual VS Code\n')
  }, guestId)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window
            .__store!.getState()
            .openFiles.some((file) => file.relativePath === 'orca-editor-test.py' && file.isDirty)
        ),
      { timeout: 10_000 }
    )
    .toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const file = window
          .__store!.getState()
          .openFiles.find((file) => file.relativePath === 'orca-editor-test.py')!
        let claimed = false
        window.dispatchEvent(
          new CustomEvent('orca:editor-save-file', {
            detail: {
              fileId: file.id,
              claim: () => {
                claimed = true
              },
              resolve,
              reject: (message: string) => reject(new Error(message))
            }
          })
        )
        if (!claimed) {
          reject(new Error('Orca did not claim the save request'))
        }
      })
  )
  await expect
    .poll(() => readFileSync(pythonPath, 'utf8'), { timeout: 15_000 })
    .toContain('saved from actual VS Code')
  await electronApp.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id)
    await guest?.executeJavaScript(
      `document.querySelector('.monaco-editor [role="textbox"]')?.focus()`
    )
    await guest?.insertText('\n# retained across native Markdown\n')
  }, guestId)
  await page.evaluate(
    ({ worktreeId, markdownPath }) =>
      window.__store!.getState().openFile({
        filePath: markdownPath,
        relativePath: 'orca-editor-test.md',
        worktreeId,
        language: 'markdown',
        mode: 'edit'
      }),
    { worktreeId, markdownPath }
  )
  await expect(page.locator('.rich-markdown-editor')).toBeVisible({ timeout: 30_000 })
  expect(
    await page.evaluate(() =>
      document.querySelector<Electron.WebviewTag>('[data-vscode-editor-guest]')?.getWebContentsId()
    )
  ).toBe(guestId)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const file = window
          .__store!.getState()
          .openFiles.find((file) => file.relativePath === 'orca-editor-test.py')!
        window.dispatchEvent(
          new CustomEvent('orca:editor-save-file', {
            detail: { fileId: file.id, claim: () => {}, resolve, reject }
          })
        )
      })
  )
  expect(readFileSync(pythonPath, 'utf8')).toContain('retained across native Markdown')
  await page.evaluate(
    ({ worktreeId, notebookPath }) =>
      window.__store!.getState().openFile({
        filePath: notebookPath,
        relativePath: 'orca-editor-test.ipynb',
        worktreeId,
        language: 'json',
        mode: 'edit'
      }),
    { worktreeId, notebookPath }
  )
  await expect(page.getByText('Starting VS Code…', { exact: true })).toHaveCount(0, {
    timeout: 60_000
  })
  const notebookGuestId = await page.evaluate(() =>
    document.querySelector<Electron.WebviewTag>('[data-vscode-editor-guest]')?.getWebContentsId()
  )
  if (!notebookGuestId) {
    throw new Error('Notebook guest is missing')
  }
  expect(notebookGuestId).toBe(guestId)
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)
              ?.executeJavaScript(
                `({notebook:[...document.querySelectorAll('.notebookOverlay')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0), text:document.body.innerText})`
              ),
          notebookGuestId
        ),
      { timeout: 60_000 }
    )
    .toMatchObject({ notebook: true })
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)
              ?.executeJavaScript('document.body.innerText.replaceAll("\\u00a0", " ")'),
          notebookGuestId
        ),
      { timeout: 30_000 }
    )
    .toContain('print(6 * 7)')
  const chrome = await electronApp.evaluate(
    ({ webContents }, id) =>
      webContents
        .fromId(id)
        ?.executeJavaScript(
          `({tabs:document.querySelectorAll('.tabs-container .tab').length,minimaps:[...document.querySelectorAll('.minimap')].filter(e=>e.getBoundingClientRect().width>0).length,sidebar:[...document.querySelectorAll('.part.sidebar,.part.auxiliarybar')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).length,foreground:getComputedStyle(document.querySelector('.monaco-editor')||document.body).getPropertyValue('--vscode-editor-foreground')})`
        ),
    notebookGuestId
  )
  expect(chrome).toMatchObject({ tabs: 0, minimaps: 0, sidebar: 0 })
  await expect(
    page.getByRole('group', { name: 'Workspace tabs' }).locator('[data-vscode-workspace-icon]')
  ).not.toHaveCount(0)
  const runNotebook = async (expectedOutput: number, executionCount: number): Promise<void> => {
    await electronApp.evaluate(async ({ webContents }, id) => {
      await webContents.fromId(id)?.executeJavaScript(`(() => {
      const run = [...document.querySelectorAll('[aria-label],[title]')].find(e =>
        (e.getAttribute('aria-label') || e.getAttribute('title') || '').startsWith('Run All') && e.getBoundingClientRect().width > 0);
      if (!run) throw new Error('Notebook Run All control is missing');
      run.click();
    })()`)
    }, notebookGuestId)
    await expect
      .poll(
        async () => {
          await electronApp.evaluate(async ({ webContents }, id) => {
            await webContents.fromId(id)?.executeJavaScript(`(() => {
      const dialog = document.querySelector('.monaco-dialog-box');
      const trust = dialog && [...dialog.querySelectorAll('button,.monaco-button')].find(e => /trust/i.test(e.textContent) && !/don't|not/i.test(e.textContent));
      if (trust) trust.click();
    })()`)
          }, notebookGuestId)
          await page.evaluate(
            () =>
              new Promise<void>((resolve, reject) => {
                const file = window
                  .__store!.getState()
                  .openFiles.find((file) => file.relativePath === 'orca-editor-test.ipynb')!
                window.dispatchEvent(
                  new CustomEvent('orca:editor-save-file', {
                    detail: { fileId: file.id, claim: () => {}, resolve, reject }
                  })
                )
              })
          )
          const cell = JSON.parse(readFileSync(notebookPath, 'utf8')).cells[0]
          return { executionCount: cell.execution_count, output: JSON.stringify(cell.outputs) }
        },
        { timeout: 60_000 }
      )
      .toMatchObject({
        executionCount: expect.any(Number),
        output: expect.stringContaining(String(expectedOutput))
      })
    expect(
      JSON.parse(readFileSync(notebookPath, 'utf8')).cells[0].execution_count
    ).toBeGreaterThanOrEqual(executionCount)
  }
  await runNotebook(42, 1)
  await page
    .getByRole('group', { name: 'Workspace tabs' })
    .locator('button[data-empty]')
    .first()
    .click()
  const quickLaunch = page.locator('[data-workspace-quick-launch]')
  await expect(quickLaunch).toBeVisible()
  await expect(page.locator('[data-vscode-editor-guest]')).toBeHidden()
  await quickLaunch.getByRole('button', { name: 'VS Code', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Go to file', exact: true })
  await picker.getByRole('combobox').fill('orca-editor-test.ipynb')
  await picker.getByRole('option').filter({ hasText: 'orca-editor-test.ipynb' }).click()
  await expect(picker).toBeHidden()
  expect(
    await page.evaluate(() =>
      document.querySelector<Electron.WebviewTag>('[data-vscode-editor-guest]')?.getWebContentsId()
    )
  ).toBe(notebookGuestId)
  expect(JSON.parse(readFileSync(notebookPath, 'utf8')).cells[0].execution_count).toBeGreaterThan(0)
  expect(JSON.stringify(JSON.parse(readFileSync(notebookPath, 'utf8')).cells[0].outputs)).toContain(
    '42'
  )
  const render = await electronApp.evaluate(async ({ BrowserWindow, webContents }, id) => {
    await webContents.fromId(id)?.capturePage(undefined, { stayHidden: true, stayAwake: true })
    return (
      await BrowserWindow.getAllWindows()[0]!.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true
      })
    )
      .toPNG()
      .toString('base64')
  }, notebookGuestId)
  writeFileSync(testInfo.outputPath('actual-orca-notebook.png'), Buffer.from(render, 'base64'))
  await testInfo.attach('actual-orca-notebook', {
    body: Buffer.from(render, 'base64'),
    contentType: 'image/png'
  })
  await page.screenshot({ path: testInfo.outputPath('orca-vscode-notebook.png') })
  await electronApp.evaluate(({ webContents }, id) => {
    const guest = webContents.fromId(id)
    guest?.sendInputEvent({
      type: 'keyDown',
      keyCode: 'w',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control']
    })
    guest?.sendInputEvent({
      type: 'keyUp',
      keyCode: 'w',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control']
    })
  }, notebookGuestId)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window
            .__store!.getState()
            .openFiles.some((file) => file.relativePath === 'orca-editor-test.ipynb')
        ),
      { timeout: 10_000 }
    )
    .toBe(false)
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDefaultSettings } from '../../shared/constants'
import { configureAiVaultSessionSources } from './cached-session-list'
import { prepareAccountSessionResume } from './account-session-resume'
import { managedClaudeSessionRoots } from './managed-claude-session-roots'

const fixture = vi.hoisted(() => ({ root: '', home: '' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.root } }))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => fixture.root })
}))
vi.mock('../codex/codex-home-paths', () => ({ getSystemCodexHomePath: () => fixture.home }))
vi.mock('./claude-shared-projects-root', () => ({
  claudeSharedProjectsRoot: () => join(fixture.root, 'dot-claude', 'projects')
}))

let settings: ReturnType<typeof getDefaultSettings>
let source: string
let target: string
beforeEach(async () => {
  fixture.root = await mkdtemp(join(tmpdir(), 'orca-account-session-'))
  fixture.home = join(fixture.root, 'system-codex')
  settings = getDefaultSettings(fixture.root)
  const home = join(fixture.root, 'codex-accounts', 'b', 'home')
  await mkdir(home, { recursive: true })
  await writeFile(join(home, '.orca-managed-home'), 'b\n')
  settings.codexManagedAccounts = [
    {
      id: 'b',
      email: 'b@example.invalid',
      managedHomePath: home,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  ]
  source = join(fixture.home, 'sessions', '2026', '10', '14', 'rollout-session.jsonl')
  target = join(home, 'sessions', '2026', '10', '14', 'rollout-session.jsonl')
  await mkdir(dirname(source), { recursive: true })
  await writeFile(source, '{"session":"original"}\n')
  configureAiVaultSessionSources({})
})
afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true })
})
const args = () => ({
  agent: 'codex' as const,
  accountId: 'b',
  filePath: source,
  codexHome: null,
  executionHostId: 'local' as const
})

async function claudeFixture(): Promise<void> {
  for (const id of ['a', 'b']) {
    const auth = join(fixture.root, 'claude-accounts', id, 'auth')
    await mkdir(auth, { recursive: true })
    await writeFile(join(auth, '.orca-managed-claude-auth'), `${id}\n`)
    settings.claudeManagedAccounts.push({
      id,
      email: `${id}@example.invalid`,
      managedAuthPath: auth,
      authMethod: 'subscription-oauth',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })
  }
  const roots = managedClaudeSessionRoots(settings)
  source = join(roots[0]!, 'project', 'claude-id.jsonl')
  // Account profiles share ~/.claude/projects, so every Claude account resumes from there.
  target = join(fixture.root, 'dot-claude', 'projects', 'project', 'claude-id.jsonl')
  await mkdir(dirname(source), { recursive: true })
  await mkdir(dirname(target), { recursive: true })
}

function conversation(last: string, hour: number): string {
  return [
    { type: 'user', sessionId: 'claude-id', uuid: 'first', message: { content: 'hello' } },
    {
      type: 'assistant',
      sessionId: 'claude-id',
      uuid: last,
      timestamp: `2026-10-15T${hour}:00:00.000Z`,
      message: { content: last }
    }
  ]
    .map((row) => `${JSON.stringify(row)}\n`)
    .join('')
}

describe('account-scoped session preparation', () => {
  it('copies one transcript into the chosen account without changing selection', async () => {
    const selected = settings.activeCodexManagedAccountId
    expect(await prepareAccountSessionResume(args(), settings)).toEqual({
      useRealCodexHome: false,
      substituteCodexHome: settings.codexManagedAccounts[0]!.managedHomePath
    })
    expect(await readFile(target, 'utf8')).toBe(await readFile(source, 'utf8'))
    expect(settings.activeCodexManagedAccountId).toBe(selected)
    await expect(prepareAccountSessionResume(args(), settings)).resolves.toBeTruthy()
  })
  it.each([false, true])('reconciles Codex branches with newer target: %s', async (newerTarget) => {
    const transcript = (hour: number, text: string) =>
      [
        { type: 'session_meta', payload: { id: 'codex-id' } },
        {
          type: 'response_item',
          timestamp: '2026-10-20T10:00:00Z',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }]
          }
        },
        {
          type: 'response_item',
          timestamp: `2026-10-20T${hour}:00:00Z`,
          payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
        },
        { type: 'event_msg', timestamp: '2099-01-01', payload: { type: 'thread_settings_applied' } }
      ]
        .map((row) => `${JSON.stringify(row)}\n`)
        .join('')
    const older = transcript(11, 'older')
    const newer = transcript(18, 'newer\u2028branch')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(source, newerTarget ? older : newer)
    await writeFile(target, newerTarget ? newer : older)
    await utimes(target, 1, 1)
    await expect(
      prepareAccountSessionResume({ ...args(), sessionId: 'codex-id' }, settings)
    ).resolves.toEqual({
      useRealCodexHome: false,
      substituteCodexHome: settings.codexManagedAccounts[0]!.managedHomePath
    })
    expect(await readFile(target, 'utf8')).toBe(newer)
    const backups = join(
      settings.codexManagedAccounts[0]!.managedHomePath,
      '.orca-session-resume-backups'
    )
    if (!newerTarget) {
      const [backup] = await readdir(backups)
      expect(await readFile(join(backups, backup!, 'rollout-session.jsonl'), 'utf8')).toBe(older)
    }
    await expect(
      prepareAccountSessionResume({ ...args(), sessionId: 'codex-id' }, settings)
    ).resolves.toBeTruthy()
  })
  it('refuses a conflicting existing transcript without overwriting it', async () => {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, 'another conversation')
    await expect(prepareAccountSessionResume(args(), settings)).rejects.toThrow(
      'No history was overwritten'
    )
    expect(await readFile(target, 'utf8')).toBe('another conversation')
  })
  it('refuses unknown accounts and remote account requests', async () => {
    await expect(
      prepareAccountSessionResume({ ...args(), accountId: 'missing' }, settings)
    ).rejects.toThrow('not available')
    await expect(
      prepareAccountSessionResume({ ...args(), executionHostId: 'ssh:remote' }, settings)
    ).rejects.toThrow('local host')
  })
  it('refuses transcript paths outside known history', async () => {
    const outside = join(fixture.root, 'secret.jsonl')
    await writeFile(outside, 'secret')
    await expect(
      prepareAccountSessionResume({ ...args(), filePath: outside }, settings)
    ).rejects.toThrow('outside')
  })
  it('refuses source symlinks and redirected target folders', async () => {
    const alias = join(dirname(source), 'alias.jsonl')
    await symlink(source, alias)
    await expect(
      prepareAccountSessionResume({ ...args(), filePath: alias }, settings)
    ).rejects.toThrow('regular file')
    await symlink(
      join(fixture.home, 'sessions'),
      join(settings.codexManagedAccounts[0]!.managedHomePath, 'sessions'),
      'dir'
    )
    await expect(prepareAccountSessionResume(args(), settings)).rejects.toThrow('redirected')
  })
  it('copies Claude history from a legacy account folder into the shared projects folder', async () => {
    await claudeFixture()
    await writeFile(source, 'claude conversation')
    await expect(
      prepareAccountSessionResume({ ...args(), agent: 'claude' }, settings)
    ).resolves.toEqual({ useRealCodexHome: false })
    expect(await readFile(target, 'utf8')).toBe('claude conversation')
  })
  it('uses the latest Claude conversation and archives the other account branch', async () => {
    await claudeFixture()
    const older = conversation('account-b-branch', 11)
    const latest = conversation('account-a-branch', 18)
    await writeFile(source, latest)
    await writeFile(target, older)
    await prepareAccountSessionResume(
      { ...args(), agent: 'claude', sessionId: 'claude-id' },
      settings
    )
    expect(await readFile(target, 'utf8')).toBe(latest)
    expect(await readFile(source, 'utf8')).toBe(latest)
    const backups = join(dirname(dirname(target)), '..', '.orca-session-resume-backups')
    const [backup] = await readdir(backups)
    expect(await readFile(join(backups, backup!, 'claude-id.jsonl'), 'utf8')).toBe(older)
    await prepareAccountSessionResume({ ...args(), agent: 'claude' }, settings)
    expect(await readdir(backups)).toHaveLength(1)
  })
  it('keeps a newer Claude target even if the older source was copied more recently', async () => {
    await claudeFixture()
    await writeFile(source, conversation('older', 11))
    const latest = conversation('newest', 18)
    await writeFile(target, latest)
    await utimes(target, 1, 1)
    await prepareAccountSessionResume({ ...args(), agent: 'claude' }, settings)
    expect(await readFile(target, 'utf8')).toBe(latest)
    expect(await readFile(source, 'utf8')).toBe(conversation('older', 11))
  })
})

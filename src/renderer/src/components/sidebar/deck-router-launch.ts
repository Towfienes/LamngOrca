import { isWindowsDesktopClient } from '@/lib/windows-path-access'

const SAFE_SESSION_ID = /^[\w-]+$/

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Windows desktops type agent commands into PowerShell, which has its own quoting and `cd`. */
function changeDirectoryCommand(cwd: string, windows: boolean): string {
  return windows
    ? `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; `
    : `cd ${shellQuote(cwd)} && `
}

/**
 * A Claude-format launcher command line (claude9, deeprelay) with optional resume.
 * `claude --resume` only finds a transcript under the project dir of the session's start
 * cwd, so a session from another directory is resumed from there.
 */
export function buildClaudeRouterCommand(
  launcher: string,
  args: string,
  resume?: { sessionId: string; cwd: string | null; workspacePath: string | null },
  windows = isWindowsDesktopClient()
): string {
  if (resume && !SAFE_SESSION_ID.test(resume.sessionId)) {
    throw new Error(`Unsupported ${launcher} session id: ${resume.sessionId}`)
  }
  const command = [launcher, resume ? `--resume ${resume.sessionId}` : '', args.trim()]
    .filter(Boolean)
    .join(' ')
  return resume?.cwd && resume.cwd !== resume.workspacePath
    ? `${changeDirectoryCommand(resume.cwd, windows)}${command}`
    : command
}

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Account profiles link ~/.claude/projects, so a transcript there resumes under any account. */
export function claudeSharedProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

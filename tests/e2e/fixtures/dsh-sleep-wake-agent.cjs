const fs = require('node:fs')
const http = require('node:http')
const crypto = require('node:crypto')

const endpoint = fs.readFileSync(process.env.ORCA_AGENT_HOOK_ENDPOINT, 'utf8')
function readEndpoint(name) {
  const match = endpoint.match(new RegExp(`^${name}=['"]?([^'"\\n]+)`, 'm'))
  if (!match) {
    throw new Error(`Missing endpoint field ${name}`)
  }
  return match[1]
}
const resumeIndex = process.argv.indexOf('--resume')
const sessionId = resumeIndex !== -1 ? process.argv[resumeIndex + 1] : crypto.randomUUID()
if (process.env.ORCA_DSH_WAKE_LOG) {
  fs.appendFileSync(
    process.env.ORCA_DSH_WAKE_LOG,
    `${JSON.stringify({ sessionId, launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN })}\n`
  )
}
const body = new URLSearchParams({
  paneKey: process.env.ORCA_PANE_KEY,
  tabId: process.env.ORCA_TAB_ID,
  worktreeId: process.env.ORCA_WORKTREE_ID,
  launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN,
  env: process.env.ORCA_AGENT_HOOK_ENV,
  version: process.env.ORCA_AGENT_HOOK_VERSION,
  payload: JSON.stringify({
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    source: 'startup',
    cwd: process.cwd(),
    transcript_path: ''
  })
}).toString()
const request = http.request(
  {
    hostname: '127.0.0.1',
    port: readEndpoint('ORCA_AGENT_HOOK_PORT'),
    path: '/hook/dsh',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'X-Orca-Agent-Hook-Token': readEndpoint('ORCA_AGENT_HOOK_TOKEN')
    }
  },
  (response) => {
    response.resume()
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Hook returned ${response.statusCode}`)
      }
      process.stdout.write(
        `\x1b]0;✦ 🐋 Sleep wake fixture\x07DSH_SLEEP_WAKE_READY:${sessionId}\r\n`
      )
    })
  }
)
request.on('error', (error) => {
  throw error
})
request.end(body)
process.stdin.resume()
setInterval(() => {}, 1000)

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { MCP, PACKAGE_ROOT } from '../helpers/paths'

/**
 * The server starts when it is run through a symlink.
 *
 * That is not an unusual way to run it: it is the only way `npx thetowersdk-mcp` ever does, since
 * npm installs a `bin` as a link in `node_modules/.bin`, and under pnpm the package directory is
 * itself a link. The "am I the entry point?" check compared the path as typed with the path Node
 * resolved, found them different, and decided the file had merely been imported. The process
 * exited 0 having said nothing -- to an MCP client, a server that never came up.
 *
 * Every other test spawns `mcp/server.mjs` by its real path, which is the one case that worked.
 */
const canLink = process.platform !== 'win32'

it.skipIf(!canLink)('answers initialize when launched through a symlink', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'thetowersdk-bin-'))
  const link = path.join(dir, 'thetowersdk-mcp')
  symlinkSync(path.join(MCP, 'server.mjs'), link)

  const child = spawn(process.execPath, [link], { cwd: PACKAGE_ROOT, windowsHide: true })
  let output = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk })
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const closed = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })

  try {
    child.stdin.end(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    }) + '\n')
    const code = await closed
    expect(code, stderr).toBe(0)
    const reply = JSON.parse(output.trim().split('\n')[0] || 'null')
    expect(reply?.id).toBe(1)
    expect(reply?.result?.serverInfo?.name).toBe('thetowersdk')
  } finally {
    child.kill()
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000)

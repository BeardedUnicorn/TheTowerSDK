/**
 * The save tools without a path: the server looks for the export itself.
 *
 * Each case starts its own server, because where it looks is decided by that process's home
 * folder and environment, and the shared server in `mcp-server.test.ts` has this machine's.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.join(HERE, '..', 'mcp', 'server.mjs')
const DIST = path.join(HERE, '..', 'dist', 'node', 'find-export.js')
const FIXTURE = path.join(HERE, '..', 'fixtures', 'save', 'labs-keys.sample.json')

/** The server reads `dist/`, so there is nothing to talk to before a build that has the finder. */
const describeServer = existsSync(DIST) ? describe : describe.skip

/** One tool call against a fresh server whose home folder and environment are given. */
function callOnce(home: string, env: Record<string, string>, name: string, args: Record<string, unknown>) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const { TOWER_TOOL_EXPORT: _ignored, ...inherited } = process.env
    const child = spawn('node', [SERVER], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...inherited, HOME: home, USERPROFILE: home, ...env },
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timeout: ${name}`))
    }, 20_000)
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      clearTimeout(timer)
      child.kill()
      const text = JSON.parse(buffer.slice(0, newline)).result?.content?.[0]?.text
      resolve(text ? JSON.parse(text) : {})
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })}\n`)
  })
}

describeServer('mcp save tools without a path', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'tower-home-'))
  afterAll(() => rmSync(home, { recursive: true, force: true }))

  it('says where it looked when there is no export to find', async () => {
    const empty = path.join(home, 'empty')
    mkdirSync(empty)
    const answer = await callOnce(empty, {}, 'decode_save', {})
    expect(answer.error).toMatch(/no tool_export\.json was found/)
    expect(Array.isArray(answer.searched)).toBe(true)
    expect(answer.searched.length).toBeGreaterThan(0)
  })

  it('reads the file TOWER_TOOL_EXPORT names', async () => {
    const answer = await callOnce(path.join(home, 'empty'), { TOWER_TOOL_EXPORT: FIXTURE }, 'decode_save', {})
    expect(answer.error).toBeUndefined()
    expect(answer.path).toBe(FIXTURE)
    expect(answer.rootKeys).toBeGreaterThan(0)
  })

  const itOnMac = process.platform === 'darwin' ? it : it.skip

  itOnMac('finds the export in the game\'s macOS container', async () => {
    const mac = path.join(home, 'mac')
    const container = path.join(mac, 'Library', 'Containers', 'D26913FA-4CC5-46E9-8DEC-E59AB0EEDABD')
    const documents = path.join(container, 'Data', 'Documents')
    mkdirSync(documents, { recursive: true })
    copyFileSync(FIXTURE, path.join(documents, 'tool_export.json'))
    writeFileSync(path.join(container, '.com.apple.containermanagerd.metadata.plist'), 'bplist00 com.TechTreeGames.TheTower')

    const answer = await callOnce(mac, {}, 'run_extractor', { extractor: 'readLabsFromSaveRoot' })
    expect(answer.error).toBeUndefined()
    expect(answer.extractor).toBe('readLabsFromSaveRoot')

    const decoded = await callOnce(mac, {}, 'decode_save', {})
    expect(decoded.path).toBe(path.join(documents, 'tool_export.json'))
  })
})

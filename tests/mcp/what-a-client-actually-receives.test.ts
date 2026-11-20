/**
 * The server as a client sees it, over the real pipe.
 *
 * Every other audit in this directory imports `TOOLS` and reads the source. That is the right place
 * to check a tool's body and the wrong place to check what leaves the process: the stdio loop cut
 * every description to 180 characters, sent `{ error }` answers as successes and never enforced a
 * schema, and no audit could see any of it because none of them went through the loop.
 *
 * So this one spawns the server and speaks the protocol. It also gives the ledger tools a
 * directory of their own, which is the only way to exercise them: they write.
 */
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS, TOWER_ORACLE_TOOLS, availableTools } from '../../mcp/server.mjs'
import { DIST, FIXTURES, MCP, PACKAGE_ROOT } from '../helpers/paths'
import { IN_MONOREPO } from '../helpers/every-tool'

const BUILT = existsSync(path.join(DIST, 'index.js'))

interface Reply {
  result?: {
    isError?: boolean
    content?: { type: string, text: string }[]
    tools?: { name: string, description: string, annotations?: Record<string, boolean> }[]
    instructions?: string
    protocolVersion?: string
  }
  error?: { code: number, message: string }
}

describe.skipIf(!BUILT)('the server over stdio', () => {
  let child: ChildProcessWithoutNullStreams
  let scratch: string
  let nextId = 1
  const waiting = new Map<number, (reply: Reply) => void>()

  const rpc = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Reply>((resolve) => {
      const id = nextId++
      waiting.set(id, resolve)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })

  /** One tool call: whether it was flagged a failure, and its first block parsed where it is JSON. */
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await rpc('tools/call', { name, arguments: args })
    const text = reply.result?.content?.[0]?.text ?? ''
    let body: Record<string, unknown> | null = null
    try {
      body = JSON.parse(text) as Record<string, unknown>
    }
    catch {
      body = null
    }
    return { isError: reply.result?.isError === true, text, body, blocks: reply.result?.content ?? [] }
  }

  beforeAll(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'tower-mcp-'))
    child = spawn(process.execPath, [path.join(MCP, 'server.mjs')], {
      cwd: PACKAGE_ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        TOWER_MECHANICS_MAP_DIR: path.join(scratch, 'map'),
        TOWER_WIKI_DIR: path.join(scratch, 'wiki'),
        TOWER_WIKI_OFFLINE: '1',
        TOWER_MCP_COMPACT: '',
      },
    })
    let buffer = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line) as Reply & { id?: number }
        if (typeof message.id === 'number') {
          waiting.get(message.id)?.(message)
          waiting.delete(message.id)
        }
      }
    })
  })

  afterAll(() => {
    child?.kill()
    rmSync(scratch, { recursive: true, force: true })
  })

  it('answers a ping, and speaks the revision it was asked for', async () => {
    expect((await rpc('ping')).result).toEqual({})
    expect((await rpc('initialize', { protocolVersion: '2025-06-18' })).result?.protocolVersion).toBe('2025-06-18')
    /* A revision it has never heard of gets the newest it knows, not an echo of the unknown one. */
    expect((await rpc('initialize', { protocolVersion: '2099-01-01' })).result?.protocolVersion).toBe('2025-06-18')
  })

  it('sends every description whole', async () => {
    const listed = (await rpc('tools/list')).result!.tools!
    const source: Record<string, { description: string }> = { ...availableTools(), ...TOWER_ORACLE_TOOLS }

    expect(listed.map(tool => tool.name).sort()).toEqual(Object.keys(source).sort())
    for (const tool of listed) {
      expect(tool.description, tool.name).toBe(source[tool.name]!.description)
    }
    /* The sentence the 180-character cut removed, on the tool that exists to say it. */
    expect(listed.find(tool => tool.name === 'oracle_expand')!.description).toMatch(/from memory/i)
  })

  it('marks which tools write and which leave the machine', async () => {
    const listed = (await rpc('tools/list')).result!.tools!
    const hints = Object.fromEntries(listed.map(tool => [tool.name, tool.annotations]))

    for (const tool of listed) expect(tool.annotations, tool.name).toBeDefined()
    expect(hints.get_export).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    expect(hints.record_work_status).toMatchObject({ readOnlyHint: false, destructiveHint: false })
    expect(hints.wiki_page).toMatchObject({ readOnlyHint: true, openWorldHint: true })
  })

  it.skipIf(IN_MONOREPO)('names no tool in its instructions that it does not advertise', async () => {
    const instructions = (await rpc('initialize')).result!.instructions!
    const advertised = new Set((await rpc('tools/list')).result!.tools!.map(tool => tool.name))
    const every = new Set([...Object.keys(TOOLS as object), ...Object.keys(TOWER_ORACLE_TOOLS as object)])

    /* Words shaped like a tool name that are something else: ledger statuses. */
    const notTools = new Set(['awaiting_user', 'user_approved'])
    const named = [...new Set(instructions.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter(word => !notTools.has(word))

    expect(named.length).toBeGreaterThan(10)
    expect(named.filter(word => !advertised.has(word))).toEqual([])
    /* And nothing from the hidden set slipped in under a name the pattern above would miss. */
    for (const hidden of [...every].filter(name => !advertised.has(name))) {
      expect(instructions, hidden).not.toContain(hidden)
    }
    expect(instructions).not.toMatch(/docs\/AGENT_/)
    expect(instructions).not.toContain('packages/sdk/src/knowledge so')
  })

  it('flags a failed call as a failure and keeps its explanation', async () => {
    const wrongName = await call('get_export', { name: 'NOT_AN_EXPORT' })
    expect(wrongName.isError).toBe(true)
    expect(String(wrongName.body?.error)).toContain('NOT_AN_EXPORT')

    const fine = await call('get_export', { name: 'LAB_CATALOG', limit: 1 })
    expect(fine.isError).toBe(false)
    expect(fine.body?.kind).toBe('array')
  })

  it('refuses arguments that do not fit the schema, by name', async () => {
    const missing = await call('record_mechanic_note', { token: 't', mechanic: 'x' })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('`facts` is required')
    expect(missing.text).toContain('`sources` is required')

    const wrongType = await call('wiki_search', { query: 42 })
    expect(wrongType.isError).toBe(true)
    expect(wrongType.text).toContain('`query` must be a string, got number')

    const wrongItem = await call('begin_mechanic_task', { mechanic: 'x', intent: 'y', relatedHints: 'coins' })
    expect(wrongItem.text).toContain('`relatedHints` must be an array, got string')
  })

  describe('the mechanics map and ledger', () => {
    it('opens a task without a graph to mount, and says so', async () => {
      const task = await call('begin_mechanic_task', { mechanic: 'Coin Bonus', intent: 'check the stacking' })
      expect(task.isError).toBe(false)
      expect(String(task.body?.complianceToken)).toMatch(/^coin-bonus-/)
      expect(task.body?.mapDir).toBe(path.join(scratch, 'map'))
      if (!IN_MONOREPO) {
        expect(task.body?.graphMount).toMatchObject({ available: false })
        expect(JSON.stringify(task.body)).not.toMatch(/Cannot find module|sdk_graph_|ep_graph_|inspect_tab_ui|list_modules/)
      }
      expect(task.body?.oracle).toBeDefined()
    })

    it('records a note as one entry, whatever the text contains', async () => {
      const note = await call('record_mechanic_note', {
        token: 'tok',
        mechanic: 'Coin Bonus\n## Injected heading',
        facts: ['Multiplies with\n## another heading'],
        sources: ['wiki "Coins"'],
      })
      expect(note.isError).toBe(false)

      const map = readFileSync(path.join(scratch, 'map', 'MAP.md'), 'utf8')
      expect(map.match(/^## /gm)).toHaveLength(1)
      expect(map).toContain('## Coin Bonus ## Injected heading')

      const hits = await call('begin_mechanic_task', { mechanic: 'Coin Bonus', intent: 'again' })
      expect((hits.body?.mapHits as unknown[]).length).toBe(1)
    })

    it('refuses a note with nothing verified in it, and writes nothing', async () => {
      const empty = await call('record_mechanic_note', { token: 't', mechanic: 'Empty', facts: [], sources: ['x'] })
      expect(empty.isError).toBe(true)
      expect(readFileSync(path.join(scratch, 'map', 'MAP.md'), 'utf8')).not.toContain('## Empty')
    })

    it('keeps the ledger newest-first and never records work as finished', async () => {
      const entry = (title: string, status: string) =>
        call('record_work_status', { token: 'tok', title, status, summary: 'what changed' })

      expect((await entry('first', 'researching')).isError).toBe(false)
      const waiting = await entry('second', 'awaiting_user')
      expect(String(waiting.body?.reminder)).toMatch(/ready for their test/)

      for (const forbidden of ['done', 'complete', 'finished', 'shipped']) {
        const refused = await entry('nope', forbidden)
        expect(refused.isError, forbidden).toBe(true)
        expect(String(refused.body?.error), forbidden).toContain('forbidden')
      }
      expect(String((await entry('nope', 'paused')).body?.error)).toContain('unknown status')

      const ledger = readFileSync(path.join(scratch, 'map', 'LEDGER.md'), 'utf8')
      expect(ledger.indexOf('— second')).toBeLessThan(ledger.indexOf('— first'))
      expect(ledger).not.toContain('nope')
      expect(ledger.match(/^## /gm)).toHaveLength(2)
    })

    it('reports where it writes, and only documents that exist', async () => {
      const contract = await call('compliance_contract')
      expect(contract.body?.mapFile).toBe(path.join(scratch, 'map', 'MAP.md'))
      for (const doc of contract.body?.protocolDocs as string[]) {
        expect(existsSync(path.join(PACKAGE_ROOT, doc)) || IN_MONOREPO, doc).toBe(true)
      }
      if (!IN_MONOREPO) {
        expect((contract.body?.notAdvertised as { tools: string[] }).tools).toContain('sdk_graph_get')
      }
    })
  })

  describe('reading a save', () => {
    const LABS = path.join(FIXTURES, 'save', 'labs-keys.sample.json')
    let history: string

    beforeAll(() => {
      history = path.join(scratch, 'battle-history.json')
      writeFileSync(history, JSON.stringify({
        battleHistory: [
          { tier: 5, wave: 1200, battleDate: '2026-10-01T10:00:00', isTournament: false, killedBy: 1,
            coinsEarnedThisRound: 5e9, realTimeThisRound: 7200, cellsEarnedThisRound: 400 },
          { tier: 6, wave: 900, battleDate: '2026-10-02T10:00:00', isTournament: true, killedBy: 2,
            coinsEarnedThisRound: 1e9, realTimeThisRound: 3600, cellsEarnedThisRound: 100 },
          { tier: 5, wave: 1100, battleDate: '2026-10-03T10:00:00', isTournament: false, killedBy: 1,
            coinsEarnedThisRound: 4e9, realTimeThisRound: 7200, cellsEarnedThisRound: 300 },
        ],
      }))
    })

    it('battle_history returns every run, paged, with the rate the game shows', async () => {
      const all = await call('battle_history', { path: history, limit: 2 })
      expect(all.body).toMatchObject({ runs: 3, returned: 2, truncated: true, next: 2 })
      /* (5e9/2h + 4e9/2h + 1e9/1h) / 3 */
      expect(all.body?.coinsPerHour).toBeCloseTo((2.5e9 + 2e9 + 1e9) / 3, 0)
      expect((all.body?.items as { wave: string, coins: string }[])[0]).toMatchObject({ wave: '1200', coins: '5B', type: 'Farming' })

      const rest = await call('battle_history', { path: history, offset: 2 })
      expect(rest.body).toMatchObject({ returned: 1 })
      expect(rest.body?.truncated).toBeUndefined()

      const tournaments = await call('battle_history', { path: history, kind: 'tournament' })
      expect(tournaments.body).toMatchObject({ matched: 1 })

      const detail = await call('battle_history', { path: history, detail: true, limit: 1 })
      expect((detail.body?.items as Record<string, unknown>[])[0]).toHaveProperty('coinsEarnedThisRound', 5e9)
    })

    it('battle_history says a save has no history rather than returning nothing', async () => {
      const none = await call('battle_history', { path: LABS })
      expect(none.isError).toBe(false)
      expect(none.body).toMatchObject({ runs: 0, coinsPerHour: null, note: 'this save has no battle history' })

      expect((await call('battle_history', { path: path.join(scratch, 'missing.json') })).isError).toBe(true)
    })

    it('plan_effective_path plans the economy from a save and lists what it could not map', async () => {
      const plan = await call('plan_effective_path', { family: 'economy', variant: 'time', steps: 3, savePath: LABS })
      expect(plan.isError).toBe(false)
      expect(plan.body?.startedFrom).toBe('save')
      expect(Array.isArray(plan.body?.unmapped)).toBe(true)
      // The config half of the input: what the save left at its default is named, not silent.
      expect(Array.isArray(plan.body?.unfilledConfig)).toBe(true)
      expect(plan.body?.unfilledConfig.length).toBeGreaterThan(0)

      const zero = await call('plan_effective_path', { family: 'economy', variant: 'time', steps: 3 })
      expect(zero.body?.startedFrom).toBe('zero')

      const wrongFamily = await call('plan_effective_path', { family: 'damage', variant: 'coin', savePath: LABS })
      expect(wrongFamily.isError).toBe(true)
      expect(String(wrongFamily.body?.error)).toContain('economy')
    })

    it('calc_run hands a save to a calculator that reads one', async () => {
      const labs = await call('calc_run', { id: 'save.readLabsFromSaveRoot', savePath: LABS })
      expect(labs.isError).toBe(false)
      expect((labs.body?.value as { labsUnlocked: number }).labsUnlocked).toBe(5)

      const noSave = await call('calc_run', { id: 'format.numberForDisplay', args: { value: 1 }, savePath: LABS })
      expect(noSave.isError).toBe(true)
      expect(String(noSave.body?.error)).toContain('does not read a save')
    })

    it('calc_run fails a call whose discount it would have dropped', async () => {
      /*
       * Both of these came back as successes carrying 2,000,000,000 — the undiscounted price.
       * Over the wire is where it matters: the transport lets unknown keys through, so only the
       * tool can refuse, and a refusal a client does not see as `isError` is still an answer.
       */
      const lab = { labKey: 'Perk Option Quantity', level: 2 }

      const misspelt = await call('calc_run', { id: 'lab.coinCost', args: { ...lab, modifiers: { coinDiscountLevel: 43 } } })
      expect(misspelt.isError).toBe(true)
      expect(String(misspelt.body?.error)).toContain('coinDiscountLabLevel')

      const beside = await call('calc_run', { id: 'lab.coinCost', args: lab, modifiers: { coinDiscountLabLevel: 43 } })
      expect(beside.isError).toBe(true)
      expect(String(beside.body?.error)).toContain('"modifiers"')
      expect(String(beside.body?.hint)).toContain('inside `args`')

      const right = await call('calc_run', { id: 'lab.coinCost', args: { ...lab, modifiers: { coinDiscountLabLevel: 43 } } })
      expect(right.isError).toBe(false)
      expect(right.body?.value).toBe(1_742_000_000)

      // The name a caller needs is in the description of the calculator, not only in the refusal.
      const described = await call('calc_describe', { id: 'lab.coinCost' })
      const modifiers = (described.body?.params as { name: string, fields?: { name: string }[] }[])
        .find(param => param.name === 'modifiers')
      expect(modifiers?.fields?.map(field => field.name)).toContain('coinDiscountLabLevel')
    })

    it('read_save_field returns a field over the wire, and fails a path that is not there', async () => {
      const rows = await call('read_save_field', { extractor: 'readLabsFromSaveRoot', path: LABS, field: 'researches', pick: ['displayName', 'level'] })
      expect(rows.isError).toBe(false)
      expect(rows.body?.kind).toBe('list')

      const wrong = await call('read_save_field', { extractor: 'readLabsFromSaveRoot', path: LABS, field: 'research' })
      expect(wrong.isError).toBe(true)
      expect(wrong.body?.didYouMean).toContain('researches')
    })

    it('the scratchpad explains a wrong path the way decode_save does', async () => {
      const wrong = await call('sdk_sandbox_run', { mode: 'decode', savePath: path.join(scratch, 'missing.json') })
      expect(wrong.isError).toBe(true)
      expect(String(wrong.body?.error)).toContain('no file at')

      const fs = await call('sdk_sandbox_run', { mode: 'export', entry: 'fs', name: 'readFileSync' })
      expect(fs.isError).toBe(true)
      expect(String(fs.body?.error)).toContain('no such entry point')
    })
  })
})

it('says which numbers JSON could not carry, instead of sending a bare null', () => {
  const loop = new URL('../../mcp/run-stdio.mjs', import.meta.url).href
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { runStdioMcp } from ${JSON.stringify(loop)};
    runStdioMcp({ name: 't', version: '1', tools: {
      lossy: { run: () => ({ rate: NaN, nested: [1, Infinity] }) },
      clean: { run: () => ({ rate: 2 }) },
    } });
  `], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
    input: [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lossy' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'clean' } },
    ].map(message => JSON.stringify(message)).join('\n') + '\n',
  })
  const [lossy, clean] = output.trim().split('\n').map(line => JSON.parse(line).result.content)

  expect(JSON.parse(lossy[0].text)).toEqual({ rate: null, nested: [1, null] })
  expect(lossy[1].text).toContain('result.rate = NaN')
  expect(lossy[1].text).toContain('result.nested[1] = Infinity')
  expect(clean).toHaveLength(1)
})

/**
 * A call is answered as it was asked, or refused. Over the real pipe.
 *
 * Each case here came back as a success that answered a different question: an argument dropped,
 * a count cut to another parameter's default, a name matched to whatever scored highest, a table
 * sent whole from a tool whose usual answer is one number. None of them failed, which is why none
 * of them was found by a test that only asks whether a call fails.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DIST, MCP, PACKAGE_ROOT } from '../helpers/paths'

const BUILT = existsSync(path.join(DIST, 'index.js'))

/** What one previewed answer may carry, with room for the envelope around the values. */
const ANSWER_BYTES = 14_000

interface Answer {
  isError: boolean
  text: string
  body: Record<string, unknown> | null
}

function startServer(env: Record<string, string>) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [path.join(MCP, 'server.mjs')], {
    cwd: PACKAGE_ROOT,
    windowsHide: true,
    env: { ...process.env, TOWER_WIKI_OFFLINE: '1', TOWER_MCP_COMPACT: '', ...env },
  })
  let nextId = 1
  let buffer = ''
  const waiting = new Map<number, (reply: { result?: { isError?: boolean, content?: { text: string }[] } }) => void>()
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      const message = JSON.parse(line) as { id?: number }
      if (typeof message.id === 'number') {
        waiting.get(message.id)?.(message)
        waiting.delete(message.id)
      }
    }
  })
  const call = (name: string, args: Record<string, unknown> = {}) => new Promise<Answer>((resolve) => {
    const id = nextId++
    waiting.set(id, (reply) => {
      const text = reply.result?.content?.[0]?.text ?? ''
      let body: Record<string, unknown> | null = null
      try {
        body = JSON.parse(text) as Record<string, unknown>
      }
      catch {
        body = null
      }
      resolve({ isError: reply.result?.isError === true, text, body })
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`)
  })
  return { call, stop: () => child.kill() }
}

describe.skipIf(!BUILT)('a call is answered as asked', () => {
  let scratch: string
  let server: ReturnType<typeof startServer>
  let call: ReturnType<typeof startServer>['call']

  beforeAll(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'tower-mcp-asked-'))
    server = startServer({ TOWER_MECHANICS_MAP_DIR: path.join(scratch, 'map') })
    call = server.call
  })

  afterAll(() => {
    server?.stop()
    rmSync(scratch, { recursive: true, force: true })
  })

  describe('arguments', () => {
    it('refuses an argument the tool has no parameter for, and names the one that was meant', async () => {
      // Six tools call the save `path` and three call it `savePath`; this one dropped the wrong name.
      const wrongName = await call('battle_history', { savePath: path.join(scratch, 'none.json') })
      expect(wrongName.isError).toBe(true)
      expect(String(wrongName.body?.error)).toContain('does not read "savePath"')
      expect(wrongName.body?.didYouMean).toEqual(['path'])

      const noParameters = await call('compliance_contract', { verbose: true })
      expect(noParameters.isError).toBe(true)
      expect(String(noParameters.body?.error)).toContain('takes no arguments')

      // What it protects: a filter that was ignored returned every row.
      const ignoredFilter = await call('find_rows', { name: 'LAB_CATALOG', filter: 'coin' })
      expect(ignoredFilter.isError).toBe(true)
    })

    it('reads null as "not given"', async () => {
      const plain = await call('calc_list', { filter: 'rushGems' })
      const withNulls = await call('calc_list', { filter: 'rushGems', offset: null, limit: null })
      expect(withNulls.isError).toBe(false)
      expect(withNulls.text).toBe(plain.text)

      // A required argument sent as null is still missing.
      expect((await call('calc_describe', { id: null })).isError).toBe(true)
    })
  })

  describe('calc_list', () => {
    it('pages to the last calculator, in answers that stay small', async () => {
      const seen = new Set<string>()
      let offset: number | undefined = 0
      let total = 0
      for (let page = 0; offset !== undefined && page < 200; page += 1) {
        const answer = await call('calc_list', { offset, limit: 100 })
        expect(answer.isError).toBe(false)
        expect(Buffer.byteLength(answer.text)).toBeLessThan(ANSWER_BYTES)
        total = answer.body?.total as number
        for (const row of answer.body?.calculators as { id: string }[]) seen.add(row.id)
        offset = answer.body?.next as number | undefined
      }
      expect(total).toBeGreaterThan(1500)
      expect(seen.size).toBe(total)
    })

    it('reads a limit of 0 as the default, as the other lists do', async () => {
      const zero = await call('calc_list', { limit: 0 })
      expect(zero.body?.shown).toBeGreaterThan(0)
      expect(zero.text).toBe((await call('calc_list', {})).text)
    })
  })

  describe('calc_graph', () => {
    it('outlines the graph instead of listing every concept', async () => {
      const outline = await call('calc_graph', {})
      expect(Buffer.byteLength(outline.text)).toBeLessThan(ANSWER_BYTES)
      expect(outline.body?.conceptCount).toBeGreaterThan(1000)
      expect(outline.body?.truncated).toBe(true)

      const labs = await call('calc_graph', { filter: 'lab.' })
      expect(labs.body?.concepts).toContain('lab.level')
      expect((labs.body?.concepts as string[]).every(name => name.toLowerCase().includes('lab.'))).toBe(true)
    })

    it('answers a mistyped concept with the nearest, not with all of them', async () => {
      const wrong = await call('calc_graph', { concept: 'lab.levl' })
      expect(wrong.isError).toBe(true)
      expect(wrong.body?.didYouMean).toContain('lab.level')
      expect(Buffer.byteLength(wrong.text)).toBeLessThan(2_000)

      expect((await call('calc_graph', { concept: 'lab.level' })).body?.readBy).toContain('lab.coinCost')
    })
  })

  describe('calc_run', () => {
    it('sends a small value whole and previews a table', async () => {
      const small = await call('calc_run', { id: 'lab.rushGems', args: { remainingHours: 2, maxedLabCount: 3 } })
      expect(typeof small.body?.value).toBe('number')
      expect(small.body?.valueTooLarge).toBeUndefined()

      // 2.3 MB before: every workshop stat with its whole cost ladder.
      const table = await call('calc_run', { id: 'workshop.statDefinitions' })
      expect(table.isError).toBe(false)
      expect(table.body?.valueTooLarge).toBe(true)
      expect(table.body?.value).toBeUndefined()
      expect((table.body?.valuePreview as { length: number }).length).toBeGreaterThan(10)
      expect(Buffer.byteLength(table.text)).toBeLessThan(ANSWER_BYTES)
    })

    it('suggests the handle that was meant, and explains a function that threw', async () => {
      const wrongCase = await call('calc_run', { id: 'lab.rushgems', args: {} })
      expect(wrongCase.isError).toBe(true)
      expect(wrongCase.body?.didYouMean).toContain('lab.rushGems')

      const threw = await call('calc_run', { id: 'card.drawOdds', args: { candidates: {} } })
      expect(threw.isError).toBe(true)
      expect(String(threw.body?.error)).toContain('could not run on these arguments')
      expect(threw.body?.params).toEqual(['candidates: object'])
    })

    it('runs a function from an entry point the registry used to leave out', async () => {
      const column = await call('calc_run', { id: 'sheets.columnLabelToIndex', args: { label: 'AB' } })
      expect(column.body?.value).toBe(27)
      // Not a calculator, and said to be absent rather than run.
      expect((await call('calc_run', { id: 'bot.createTowerBot' })).isError).toBe(true)
    })
  })

  describe('patch_notes', () => {
    it('returns as many recent notes as were asked for', async () => {
      // `recent: 7` returned 5, `limit`'s default, and called the other two truncated.
      const seven = await call('patch_notes', { recent: 7 })
      expect(seven.body).toMatchObject({ recent: 7, matched: 7, returned: 7 })
      expect(seven.body?.truncated).toBeUndefined()

      const capped = await call('patch_notes', { recent: 7, limit: 2 })
      expect(capped.body).toMatchObject({ matched: 7, returned: 2, truncated: true })
    })

    it('says which question it answered when given two, and refuses a backwards range', async () => {
      const two = await call('patch_notes', { query: 'lab', recent: 3 })
      expect(two.body).toMatchObject({ answered: 'query', notUsed: ['recent'] })

      const backwards = await call('patch_notes', { from: '2026-01-01', to: '2025-01-01' })
      expect(backwards.isError).toBe(true)
      expect(String(backwards.body?.error)).toContain('is after')

      const forwards = await call('patch_notes', { from: '2025-01-01', to: '2026-01-01' })
      expect(forwards.body?.matched).toBeGreaterThan(0)
    })
  })

  describe('names', () => {
    it('define_term says where a term is, when it is not in the domain asked for', async () => {
      const wrongDomain = await call('define_term', { term: 'ILM', domain: 'module' })
      expect(wrongDomain.body).toMatchObject({ found: false, foundInDomains: ['ultimate-weapon'] })

      const anyCase = await call('define_term', { term: 'ILM', domain: 'Ultimate-Weapon' })
      expect(anyCase.body?.found).toBe(true)

      const unknown = await call('define_term', { term: 'zzz-not-a-term', domain: 'module' })
      expect(unknown.body?.found).toBe(false)
      expect(unknown.body?.foundInDomains).toBeUndefined()
    })

    it('the oracle does not answer for whatever a letter happens to score against', async () => {
      // "a" resolved to the patch notes archive and came back `found: true`.
      for (const tool of ['oracle_brief', 'oracle_traps'] as const) {
        const letter = await call(tool, tool === 'oracle_brief' ? { mechanic: 'a' } : { id: 'a' })
        expect(letter.body?.found, tool).toBe(false)
        expect((letter.body?.didYouMean as unknown[]).length, tool).toBeGreaterThan(0)
      }
      const footguns = await call('oracle_footguns', { mechanic: 'a' })
      expect(footguns.body?.resolvedTo).toBeUndefined()
      expect(footguns.body?.trapsForMechanic).toEqual([])

      // A plain name still resolves.
      expect((await call('oracle_brief', { mechanic: 'golden tower' })).body?.resolvedTo).toBe('ultimateWeapon.goldenTower')
      expect((await call('oracle_traps', { id: 'cards' })).body?.resolvedTo).toBe('card')
      expect((await call('oracle_footguns', { mechanic: 'bot cooldown' })).body?.resolvedTo).toBe('bot.cooldown')
    })

    it('oracle_coverage measures staleness from a date, not from any text', async () => {
      const garbage = await call('oracle_coverage', { asOf: 'garbage' })
      expect(garbage.isError).toBe(true)
      expect((await call('oracle_coverage', { asOf: '2026-01-01' })).body?.asOf).toBe('2026-01-01')
    })
  })

  describe('rows', () => {
    it('find_rows refuses to compare a column with an object', async () => {
      // `String({})` is "[object Object]", which equalled every cell that was also an object.
      const compound = await call('find_rows', { name: 'LAB_CATALOG', where: { levels: {} } })
      expect(compound.isError).toBe(true)
      expect(String(compound.body?.error)).toContain('"levels"')

      const plain = await call('find_rows', { name: 'LAB_CATALOG', where: { slug: 'labs_speed' }, fields: ['slug'] })
      expect(plain.body).toMatchObject({ matched: 1, items: [{ slug: 'labs_speed' }] })
    })

    it('battle_history keeps a detailed page inside the size budget', async () => {
      const file = path.join(scratch, 'long-history.json')
      const run = (index: number) => ({
        tier: 7,
        wave: 2000 + index,
        battleDate: `2026-10-${String((index % 27) + 1).padStart(2, '0')}T10:00:00`,
        isTournament: false,
        killedBy: 1,
        coinsEarnedThisRound: 4e9,
        realTimeThisRound: 7200,
        cellsEarnedThisRound: 300,
        ...Object.fromEntries(Array.from({ length: 80 }, (_, field) => [`recordedField${field}`, field * 1.5])),
      })
      writeFileSync(file, JSON.stringify({ battleHistory: Array.from({ length: 30 }, (_, index) => run(index)) }))

      const detailed = await call('battle_history', { path: file, detail: true, limit: 50 })
      expect(detailed.isError).toBe(false)
      expect(Buffer.byteLength(detailed.text)).toBeLessThan(ANSWER_BYTES)
      expect(detailed.body).toMatchObject({ runs: 30, sizeLimited: true, truncated: true })
      const returned = detailed.body?.returned as number
      expect(returned).toBeGreaterThan(0)
      expect(detailed.body?.next).toBe(returned)

      // The compact rows of the same thirty runs fit, and are not cut.
      const compact = await call('battle_history', { path: file, limit: 50 })
      expect(compact.body).toMatchObject({ returned: 30 })
      expect(compact.body?.sizeLimited).toBeUndefined()

      // A wrong kind is the caller's slip whether or not a save is found.
      const wrongKind = await call('battle_history', { path: path.join(scratch, 'none.json'), kind: 'bogus' })
      expect(String(wrongKind.body?.error)).toContain('no kind')
    })
  })

  describe('the scratchpad', () => {
    it('does not read text as a number, and keeps an export preview small', async () => {
      const text = await call('sdk_sandbox_run', { mode: 'format', value: 'abc' })
      expect(text.body).toMatchObject({ parsed: null, recognised: false })
      expect((await call('sdk_sandbox_run', { mode: 'format', value: '1.5M' })).body?.parsed).toBe(1_500_000)

      const table = await call('sdk_sandbox_run', { mode: 'export', name: 'LAB_CATALOG' })
      expect(table.body).toMatchObject({ found: true, length: 231, sizeLimited: true })
      expect(Buffer.byteLength(table.text)).toBeLessThan(ANSWER_BYTES)
    })
  })

  describe('the ledger', () => {
    it('refuses a blank token, title or summary, and writes nothing', async () => {
      const blank = await call('record_work_status', { token: ' ', title: 'x', status: 'researching', summary: 's' })
      expect(blank.isError).toBe(true)
      expect(blank.body).toMatchObject({ nothingWritten: true })
      expect(String(blank.body?.error)).toContain('`token`')
      expect(existsSync(path.join(scratch, 'map'))).toBe(false)
    })

    it('says what to set when the map directory cannot be written', async () => {
      // A directory under a file can never be created, on any platform.
      const blocker = path.join(scratch, 'a-file')
      writeFileSync(blocker, 'not a directory')
      const blocked = startServer({ TOWER_MECHANICS_MAP_DIR: path.join(blocker, 'map') })
      try {
        const status = await blocked.call('record_work_status', { token: 'tok', title: 'x', status: 'researching', summary: 's' })
        expect(status.isError).toBe(true)
        expect(status.body).toMatchObject({ nothingWritten: true })
        expect(String(status.body?.hint)).toContain('TOWER_MECHANICS_MAP_DIR')

        const note = await blocked.call('record_mechanic_note', { token: 'tok', mechanic: 'x', facts: ['f'], sources: ['s'] })
        expect(note.isError).toBe(true)
        expect(note.body).toMatchObject({ nothingWritten: true })
      }
      finally {
        blocked.stop()
      }
      expect(readdirSync(scratch).filter(name => name.endsWith('.tmp'))).toEqual([])
    })
  })

  describe('plan_effective_path', () => {
    it('names a level key the model does not have', async () => {
      const plan = await call('plan_effective_path', { family: 'damage', variant: 'stone', levels: { bogusKey: 5 } })
      expect(plan.isError).toBe(false)
      expect(plan.body?.unknownLevelKeys).toEqual(['bogusKey'])

      const clean = await call('plan_effective_path', { family: 'damage', variant: 'farm-time', steps: 1 })
      expect(clean.isError).toBe(false)
      expect(clean.body?.unknownLevelKeys).toBeUndefined()
    })
  })
})

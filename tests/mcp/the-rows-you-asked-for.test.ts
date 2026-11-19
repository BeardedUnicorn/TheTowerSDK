/**
 * The tools that read what the package ships, a page at a time.
 *
 * `get_export` answers "what shape is this" and stops at a sample. Everything past the sample --
 * the row for one lab, the published rows of a chart, a patch note from 2023 -- was in the package
 * and out of reach. These are the tools that reach it, and what they owe a caller is the same in
 * each: the true total, a way to continue, and a refusal that names what was wrong.
 */
import { describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS, TOWER_ORACLE_TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const run = (tool: string, args: Record<string, unknown> = {}): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>)[tool]!.run(args)) as Promise<Answer>

describe('find_rows', () => {
  it('filters, picks columns and pages, reporting the real totals', async () => {
    const page = await run('find_rows', { name: 'LAB_CATALOG', search: 'coin', fields: ['slug', 'name'], limit: 3 })
    expect(page.rows).toBeGreaterThan(200)
    expect(page.matched).toBeGreaterThan(3)
    expect(page).toMatchObject({ returned: 3, truncated: true, next: 3 })
    expect(Object.keys(page.items[0])).toEqual(['slug', 'name'])

    const next = await run('find_rows', { name: 'LAB_CATALOG', search: 'coin', fields: ['slug'], limit: 3, offset: page.next })
    expect(next.items[0].slug).not.toBe(page.items[0].slug)
  })

  it('matches a field exactly, and reaches rows a preview never showed', async () => {
    const all = await run('find_rows', { name: 'LAB_CATALOG', limit: 100, offset: 200, fields: ['slug'] })
    const last = all.items.at(-1).slug
    const one = await run('find_rows', { name: 'LAB_CATALOG', where: { slug: last } })
    expect(one.matched).toBe(1)
    expect(one.items[0].slug).toBe(last)
  })

  it('names a column that does not exist instead of matching nothing', async () => {
    const wrong = await run('find_rows', { name: 'LAB_CATALOG', where: { nope: 1 } })
    expect(wrong.error).toContain('"nope"')
    expect(wrong.columns).toContain('slug')
  })

  it('never returns more than a page, whatever it is asked for', async () => {
    const greedy = await run('find_rows', { name: 'LAB_CATALOG', limit: 100000 })
    expect(greedy.returned).toBeLessThanOrEqual(100)
    const negative = await run('find_rows', { name: 'LAB_CATALOG', limit: -5, offset: -5 })
    expect(negative.offset).toBe(0)
    expect(negative.returned).toBeGreaterThan(0)
  })

  it('refuses a name that is not an export, and a value that is not a table', async () => {
    expect((await run('find_rows', { name: 'constructor' })).error).toContain('no export')
    expect((await run('find_rows', { name: 'formatNumberForDisplay' })).error).toContain('not a table')
  })
})

describe('list_exports', () => {
  it('says when it stopped, and continues from where it did', async () => {
    const first = await run('list_exports', { entry: 'mechanics' })
    expect(first.matched).toBeGreaterThan(300)
    expect(first).toMatchObject({ truncated: true, next: 300 })

    const rest = await run('list_exports', { entry: 'mechanics', offset: first.next })
    expect(rest.exports[0].name).not.toBe(first.exports[0].name)
    expect(first.exports.length + rest.exports.length).toBeLessThanOrEqual(first.matched)
  })
})

describe('patch_notes', () => {
  it('describes the archive when asked nothing', async () => {
    const overview = await run('patch_notes')
    expect(overview.notes).toBeGreaterThan(200)
    expect(overview.earliest < overview.latest).toBe(true)
  })

  it('searches newest first, cut to the limit, with bodies shortened', async () => {
    const found = await run('patch_notes', { query: 'golden tower', limit: 2 })
    expect(found.matched).toBeGreaterThan(2)
    expect(found).toMatchObject({ returned: 2, truncated: true })
    expect(found.notes[0].postedAt > found.notes[1].postedAt).toBe(true)
    for (const note of found.notes) expect(note.body.length).toBeLessThanOrEqual(601)

    const whole = await run('patch_notes', { query: 'golden tower', limit: 1, full: true })
    expect(whole.notes[0].bodyLength).toBeUndefined()
  })

  it('finds the earliest mention, and says what silence does not prove', async () => {
    const first = await run('patch_notes', { introduced: 'Guardian' })
    expect(first.found).toBe(true)
    const every = await run('patch_notes', { query: 'Guardian', limit: 25 })
    expect(every.notes.every((note: Answer) => note.postedAt >= first.note.postedAt)).toBe(true)

    const never = await run('patch_notes', { introduced: 'zzz-not-a-mechanic-zzz' })
    expect(never.found).toBe(false)
    expect(never.guidance).toMatch(/not evidence/)
  })

  it('reads a version, and suggests one when the version is not written that way', async () => {
    expect((await run('patch_notes', { version: 'v26.0' })).matched).toBeGreaterThan(0)
    const near = await run('patch_notes', { version: '26' })
    expect(near.error).toContain('"26"')
    expect(near.didYouMean).toContain('26.0')
  })

  it('reads a date range, and refuses half of one', async () => {
    const range = await run('patch_notes', { from: '2025-03-01', to: '2025-03-31', limit: 25 })
    for (const note of range.notes) expect(note.postedAt.slice(0, 7)).toBe('2025-03')
    expect((await run('patch_notes', { from: '2025-03-01' })).error).toContain('both')
    expect((await run('patch_notes', { from: 'soon', to: 'later' })).error).toContain('dates')
  })
})

describe('chart_rows', () => {
  it('lists every chart with an id that can be asked for', async () => {
    const list = await run('chart_rows')
    expect(list.items.length).toBe(list.charts)
    /* Every listed id resolves: an id that cannot be read back is a title, not an address. */
    for (const item of list.items) {
      const rows = await run('chart_rows', { chart: item.id, limit: 1 })
      expect(rows.error, item.id).toBeUndefined()
      expect(rows.columns.length, item.id).toBeGreaterThan(0)
    }
  })

  it('pages the rows and reports how many there are', async () => {
    const list = await run('chart_rows')
    const first = await run('chart_rows', { chart: list.items[0].id, limit: 2 })
    expect(first).toMatchObject({ returned: 2 })
    expect(first.rows).toBeGreaterThanOrEqual(2)
  })

  it('refuses an unknown chart', async () => {
    expect((await run('chart_rows', { chart: 'constructor' })).error).toContain('no chart')
  })
})

describe('form_calc', () => {
  it('lists, describes and runs', async () => {
    const list = await run('form_calc')
    expect(list.calculators.length).toBeGreaterThan(10)

    const described = await run('form_calc', { id: 'lab.research' })
    expect(described.fields.length).toBeGreaterThan(0)
    expect(described.defaults).toBeDefined()

    const ran = await run('form_calc', { id: 'lab.research', input: { currentLevel: 1, targetLevel: 3 } })
    expect(ran.normalizedInput).toMatchObject({ currentLevel: 1, targetLevel: 3 })
    expect(ran.result.levels.length).toBe(2)
  })

  it('reports a key that changed nothing, and refuses an unknown id', async () => {
    const ran = await run('form_calc', { id: 'lab.research', input: { bogus: 1 } })
    expect(ran.ignoredKeys).toEqual(['bogus'])
    expect((await run('form_calc', { id: 'constructor' })).error).toContain('no form calculator')
  })

  it('every listed calculator runs on its own defaults', async () => {
    const list = await run('form_calc')
    for (const { id } of list.calculators) {
      const ran = await run('form_calc', { id, input: {} })
      expect(ran.error, id).toBeUndefined()
      expect(ran.result, id).toBeDefined()
    }
  })
})

describe('the smaller repairs', () => {
  it('plan_effective_path bounds its steps and ignores a prototype key', async () => {
    const plan = await run('plan_effective_path', { family: 'economy', variant: 'time', steps: 1e9 })
    expect(plan.steps.length).toBeLessThanOrEqual(200)
    const poisoned = await run('plan_effective_path', {
      family: 'economy', variant: 'time', steps: 1, levels: JSON.parse('{"__proto__":{"polluted":true}}'),
    })
    expect(poisoned.error).toBeUndefined()
    expect(({} as Answer).polluted).toBeUndefined()
  })

  it('describe_schema reads as a shape, with optional and nullable as flags', async () => {
    const schema = await run('describe_schema', { table: 'LAB_CATALOG' })
    expect(schema.shape.slug).toEqual({ type: 'string' })
    expect(schema.shape.category).toEqual({ type: 'string', nullable: true })
    expect(schema.shape.unit).toMatchObject({ type: 'enum', optional: true })
    expect(JSON.stringify(schema)).not.toContain('"def"')
  })

  it('wiki_page-sized answers aside, the oracle bounds and labels its own', () => {
    const oracle = TOWER_ORACLE_TOOLS as Record<string, { run: (a: unknown) => Answer }>
    expect(oracle.oracle_search!.run({ query: 'a', limit: 1e9 }).results.length).toBeLessThanOrEqual(50)
    expect(oracle.oracle_brief!.run({ mechanic: 'assist module' })).toHaveProperty('matchedExactly')

    const named = oracle.oracle_footguns!.run({ mechanic: 'bot cooldown' })
    expect(named.resolvedTo).toBeDefined()
    expect(named.matchedExactly).toBe(false)
  })

  it('run_extractor suggests the reader that was meant', async () => {
    const wrong = await run('run_extractor', { extractor: 'readLabFromSaveRoot', path: 'x' })
    expect(wrong.didYouMean).toContain('readLabsFromSaveRoot')
  })
})

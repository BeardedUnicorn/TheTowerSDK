/**
 * A preview is bounded by size, not by a count of rows or keys.
 *
 * `preview` capped an array at 40 rows and an object at its first five keys, and returned both
 * whole. Against a real save that was 123,000 characters for thirty battle runs and 65,000 for the
 * labs result — whose first key is the entire completion log, and whose `researches` and
 * `activeQueue` were never among the five. The client spilled each to a file, and an agent read
 * "not in the preview" as "not in the save".
 *
 * `a-preview-stays-a-preview` holds the row count. This holds the thing that hurt.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const run = (tool: string, args: Record<string, unknown> = {}): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>)[tool]!.run(args)) as Promise<Answer>

const sizeOf = (value: unknown) => JSON.stringify(value).length

/**
 * 12,000 characters of values, plus the envelope: key names, counts and the hint.
 *
 * Comfortably above what a fitted answer measures (the largest is under 13,000) and far below what
 * the unfitted one did (865,000 for the largest export), so it separates the two behaviours rather
 * than sitting on the line between them.
 */
const CEILING = 16_000

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'save')
const SAVES = [path.join(FIXTURES, 'labs-keys.sample.json'), path.join(FIXTURES, 'workshop-keys.sample.json')]

/** A real export, when there is one. Fixtures are a few hundred bytes and cannot be large. */
const REAL_SAVE = process.env.TOWER_TEST_SAVE

const ENTRIES = TOOLS.list_exports.inputSchema.properties.entry.enum as string[]

const everyExport = (entry: string): string[] => {
  const names: string[] = []
  let offset = 0
  for (;;) {
    const page = TOOLS.list_exports.run({ entry, offset })
    names.push(...page.exports.filter((item: Answer) => item.type !== 'function').map((item: Answer) => item.name))
    if (!page.truncated) return names
    offset = page.next
  }
}

const extractors = (): string[] => [
  ...TOOLS.list_exports.run({ entry: 'save', filter: 'FromSaveRoot' }).exports
    .map((item: Answer) => item.name)
    .filter((name: string) => /^read[A-Z].*FromSaveRoot$/.test(name)),
  'listImportableBattleRuns',
]

describe('get_export fits the budget for every export', () => {
  it('has exports large enough for this to matter', () => {
    // Unfitted, this one alone was 865,000 characters.
    const knowledge = TOOLS.get_export.run({ name: 'GAME_KNOWLEDGE' })
    expect(knowledge.outlined).toContain('compartments')
  })

  it('never exceeds the ceiling, at the default sample or the largest one', () => {
    const over: string[] = []
    let measured = 0

    for (const entry of ENTRIES) {
      for (const name of everyExport(entry)) {
        for (const limit of [undefined, 100]) {
          const size = sizeOf(TOOLS.get_export.run({ name, limit }))
          measured += 1
          if (size > CEILING) over.push(`${entry}.${name} (limit ${limit ?? 'default'}): ${size}`)
        }
      }
    }

    expect(measured).toBeGreaterThan(1000)
    expect(over, `previews over ${CEILING} characters:\n${over.join('\n')}`).toEqual([])
  }, 120_000)
})

describe('a value too large to show is described, not dropped', () => {
  it('lists every key of an object, with the large ones as shapes', () => {
    const knowledge = TOOLS.get_export.run({ name: 'GAME_KNOWLEDGE' })

    expect(Object.keys(knowledge.sample)).toEqual(knowledge.keys)
    expect(knowledge.sample.compartments).toMatchObject({ kind: 'array', length: expect.any(Number) })
    expect(knowledge.sample.compartments.columns.length).toBeGreaterThan(0)
    expect(knowledge.sample.version).toEqual(expect.any(Number))
    expect(knowledge.next).toContain('find_rows')
  })

  it('says a table of large rows was cut by size, and still reports its length', () => {
    const catalog = TOOLS.get_export.run({ name: 'LAB_CATALOG', limit: 100 })

    expect(catalog.sizeLimited).toBe(true)
    expect(catalog.truncated).toBe(true)
    expect(catalog.sampled).toBe(catalog.sample.length)
    expect(catalog.sample.length).toBeGreaterThan(0)
    expect(catalog.sample.length).toBeLessThan(100)
    expect(catalog.length).toBeGreaterThan(200)
  })

  it('keeps only the leading rows that fit, however few that is', () => {
    // 29 rows and 865,000 characters: most rows are larger than the whole budget on their own.
    const compartments = TOOLS.get_export.run({ name: 'TOWER_COMPARTMENTS' })

    expect(compartments.sizeLimited).toBe(true)
    expect(compartments.sample.length).toBeLessThan(compartments.length)
    expect(compartments.sampled).toBe(compartments.sample.length)
    expect(sizeOf(compartments)).toBeLessThan(CEILING)
  })
})

describe('find_rows cuts a page by size without losing rows', () => {
  it('stops early on large rows, says so, and continues from where it stopped', async () => {
    const first = await run('find_rows', { name: 'LAB_CATALOG', limit: 100 })

    expect(first.sizeLimited).toBe(true)
    expect(first.returned).toBeLessThan(100)
    expect(first.next).toBe(first.returned)
    expect(sizeOf(first)).toBeLessThan(CEILING)

    // Every row is still reachable, once each: paging by `next` walks the whole table.
    const seen: unknown[] = []
    let offset: number | undefined = 0
    while (offset !== undefined) {
      const page: Answer = await run('find_rows', { name: 'LAB_CATALOG', limit: 100, offset })
      seen.push(...page.items)
      offset = page.next
    }
    expect(seen).toHaveLength(first.matched)
    expect(new Set(seen.map(row => JSON.stringify(row))).size).toBe(first.matched)
  })

  it('fits a full page once the caller names columns', async () => {
    const [column] = (await run('find_rows', { name: 'LAB_CATALOG', limit: 1 })).columns
    const narrow = await run('find_rows', { name: 'LAB_CATALOG', limit: 100, fields: [column] })

    expect(narrow.returned).toBe(100)
    expect(narrow.sizeLimited).toBeUndefined()
  })

  it('still returns one row that is larger than the budget, so a page always moves', async () => {
    const page = await run('find_rows', { name: 'TOWER_COMPARTMENTS', limit: 5 })

    expect(page.returned).toBeGreaterThanOrEqual(1)
    expect(page.next).toBe(page.returned)
  })
})

describe('run_extractor shows every field of a result', () => {
  it('lists all sixteen fields of the labs result, not the first five', async () => {
    const labs = await run('run_extractor', { extractor: 'readLabsFromSaveRoot', path: SAVES[0] })

    expect(Object.keys(labs.sample)).toEqual(labs.keys)
    expect(labs.keys).toEqual(expect.arrayContaining(['completions', 'activeQueue', 'researches']))
    expect(labs.keys.length).toBeGreaterThan(5)
  })

  it('fits the budget for every extractor on every fixture', async () => {
    const over: string[] = []
    for (const save of SAVES) {
      for (const extractor of extractors()) {
        const size = sizeOf(await run('run_extractor', { extractor, path: save }))
        if (size > CEILING) over.push(`${extractor} on ${path.basename(save)}: ${size}`)
      }
    }
    expect(over).toEqual([])
  })

  it.runIf(Boolean(REAL_SAVE))('fits the budget on a real save, and points at the tool that reads the rest', async () => {
    const over: string[] = []
    for (const extractor of extractors()) {
      const size = sizeOf(await run('run_extractor', { extractor, path: REAL_SAVE }))
      if (size > CEILING) over.push(`${extractor}: ${size}`)
    }
    expect(over).toEqual([])

    const labs = await run('run_extractor', { extractor: 'readLabsFromSaveRoot', path: REAL_SAVE })
    expect(labs.outlined).toEqual(expect.arrayContaining(['completions', 'researches']))
    expect(labs.next).toContain('read_save_field')

    const runs = await run('run_extractor', { extractor: 'listImportableBattleRuns', path: REAL_SAVE })
    expect(runs.next).toContain('read_save_field')

    // The same data through the tool the hint names: a page of whole runs still fits.
    const newest = await run('read_save_field', { extractor: 'listImportableBattleRuns', path: REAL_SAVE, offset: -10 })
    expect(sizeOf(newest)).toBeLessThan(CEILING)
    expect(newest.returned).toBeGreaterThan(0)
  }, 120_000)
})

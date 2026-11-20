/**
 * `read_save_field` returns the data `run_extractor` only describes.
 *
 * A coaching skill told agents to call this tool for lab levels, the running queue and run history
 * before the tool existed. They fell back to `run_extractor`, which returned 65,000 characters for
 * the labs result and still left out `researches` and `activeQueue`, and from there to opening the
 * export with a script — the thing the server is there to make unnecessary.
 *
 * What it owes a caller is what `find_rows` owes one: the real total, a way to continue, and a
 * refusal that names what was wrong instead of an answer to a different question.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const run = (tool: string, args: Record<string, unknown> = {}): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>)[tool]!.run(args)) as Promise<Answer>

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'save')
const LABS = path.join(FIXTURES, 'labs-keys.sample.json')
const WORKSHOP = path.join(FIXTURES, 'workshop-keys.sample.json')

const labs = (args: Record<string, unknown> = {}) =>
  run('read_save_field', { extractor: 'readLabsFromSaveRoot', path: LABS, ...args })

describe('read_save_field reads a list as rows', () => {
  it('returns the rows of a field, with the columns named and the real total', async () => {
    const rows = await labs({ field: 'researches', pick: ['displayName', 'level'] })

    expect(rows).toMatchObject({ extractor: 'readLabsFromSaveRoot', field: 'researches', kind: 'list' })
    expect(rows.rows).toBe(rows.items.length)
    expect(rows.columns).toContain('slug')
    expect(Object.keys(rows.items[0])).toEqual(['displayName', 'level'])
  })

  it('reaches the fields a five-key preview never showed', async () => {
    // `researches` is the ninth key and `activeQueue` the seventh. Neither was in a preview.
    const queue = await labs({ field: 'activeQueue' })
    expect(queue.kind).toBe('list')
    expect(queue.items.length).toBeGreaterThan(0)
    expect(queue.items[0]).toHaveProperty('slotIndex')
  })

  it('filters with where and search, as find_rows does', async () => {
    const one = await labs({ field: 'researches', where: { index: 1 } })
    expect(one.matched).toBe(1)
    expect(one.items[0].index).toBe(1)

    const found = await labs({ field: 'researches', search: one.items[0].displayName, pick: ['index'] })
    expect(found.items.map((row: Answer) => row.index)).toContain(1)
  })

  it('counts a negative offset from the end, because the newest row is last', async () => {
    const all = await labs({ field: 'researches', pick: ['index'] })
    const tail = await labs({ field: 'researches', pick: ['index'], offset: -2 })

    expect(tail.offset).toBe(all.rows - 2)
    expect(tail.items).toEqual(all.items.slice(-2))
    expect(tail.truncated).toBeUndefined()

    // Asking for more than there is starts at the first row rather than wrapping or failing.
    const tooFar = await labs({ field: 'researches', pick: ['index'], offset: -1000 })
    expect(tooFar.offset).toBe(0)
    expect(tooFar.items).toEqual(all.items)
  })

  it('pages, and says where the next page starts', async () => {
    const first = await labs({ field: 'researches', pick: ['index'], limit: 1 })
    expect(first).toMatchObject({ returned: 1, truncated: true, next: 1 })

    const second = await labs({ field: 'researches', pick: ['index'], limit: 1, offset: first.next })
    expect(second.items[0].index).not.toBe(first.items[0].index)
  })

  it('reads a list the extractor returns directly, with no field', async () => {
    const runs = await run('read_save_field', { extractor: 'listImportableBattleRuns', path: LABS })
    expect(runs.kind).toBe('list')
    expect(runs.field).toBeUndefined()
    expect(runs.rows).toBe(0)
  })
})

describe('read_save_field follows a path', () => {
  it('walks into objects and lists, in either index spelling', async () => {
    const dotted = await labs({ field: 'researches.1.displayName' })
    const bracketed = await labs({ field: 'researches[1].displayName' })

    expect(dotted.kind).toBe('string')
    expect(dotted.value).toEqual(expect.any(String))
    expect(bracketed.value).toBe(dotted.value)
  })

  it('reads a nested object key by key', async () => {
    const levels = await run('read_save_field', { extractor: 'readWorkshopFromSaveRoot', path: WORKSHOP, field: 'active.levels' })

    expect(levels.kind).toBe('object')
    expect(levels.keyCount).toBeGreaterThan(0)
    expect(Object.keys(levels.value)).toHaveLength(levels.keyCount)
  })

  it('reads the whole result as an object when no field is given, and pick chooses keys', async () => {
    const whole = await labs()
    expect(whole.kind).toBe('object')
    expect(Object.keys(whole.value)).toContain('researches')

    const two = await labs({ pick: ['labsUnlocked', 'researchedCount'] })
    expect(Object.keys(two.value)).toEqual(['labsUnlocked', 'researchedCount'])
  })

  it('carries the extractor\'s warnings beside the data', async () => {
    const rows = await labs({ field: 'researches', limit: 1 })
    expect(rows.warnings.length).toBeGreaterThan(0)
  })
})

describe('read_save_field refuses rather than answering something else', () => {
  it('names the step of a path that is not there, and what is', async () => {
    const wrong = await labs({ field: 'research' })

    expect(wrong.error).toContain('"research"')
    expect(wrong.available).toContain('researches')
    expect(wrong.didYouMean).toContain('researches')
  })

  it('says when a path runs past a list or into a number', async () => {
    expect((await labs({ field: 'researches.999' })).error).toContain('not a position')
    expect((await labs({ field: 'researches.first' })).error).toContain('not a position')
    expect((await labs({ field: 'labsUnlocked.x' })).error).toContain('is a number')
  })

  it('never resolves a path through the prototype', async () => {
    for (const step of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const reached = await labs({ field: step })
      expect(reached.error, step).toContain(`"${step}"`)
      expect(reached.value, step).toBeUndefined()
    }
    const extractor = await run('read_save_field', { extractor: 'constructor', path: LABS })
    expect(extractor.error).toContain('no extractor')
  })

  it('names a column or key that does not exist', async () => {
    const column = await labs({ field: 'researches', pick: ['levle'] })
    expect(column.error).toContain('"levle"')
    expect(column.didYouMean).toContain('level')

    const key = await labs({ pick: ['labsUnlocked', 'nope'] })
    expect(key.error).toContain('"nope"')
    expect(key.keys).toContain('labsUnlocked')
  })

  it('refuses a row filter on an object instead of dropping it', async () => {
    const filtered = await labs({ where: { index: 1 } })
    expect(filtered.error).toContain('is an object')
    expect(filtered.value).toBeUndefined()
  })

  it('refuses an argument it does not read', async () => {
    // `fields` is what find_rows calls it. Dropped, the caller gets whole rows and no reason.
    const wrong = await labs({ field: 'researches', fields: ['level'] })

    expect(wrong.error).toContain('"fields"')
    expect(wrong.error).toContain('pick')
    expect(wrong.items).toBeUndefined()
  })

  it('explains a wrong save path and an unknown extractor the way run_extractor does', async () => {
    const missing = await run('read_save_field', { extractor: 'readLabsFromSaveRoot', path: path.join(FIXTURES, 'absent.json') })
    expect(missing.error).toContain('no file at')

    const unknown = await run('read_save_field', { extractor: 'readLabFromSaveRoot', path: LABS })
    expect(unknown.didYouMean).toContain('readLabsFromSaveRoot')
  })
})

/**
 * `decode_save` answers, on every export it is handed, in every build that ships.
 *
 * It shipped broken through 0.14.1: the handler called `sdk.save.discoverSaveImportTargets`, a
 * function that never existed, so every call answered "decode_save failed: … is not a function".
 * Nothing caught it because the only test that called the tool needed a real save and skipped
 * without one. An installed copy of that build still answers that way today.
 *
 * The fix for that one call is not the guard. These are, one per way the tool can stop working:
 *
 * - the server names a package member that is not there (the 0.14.1 defect, for every tool);
 * - a reader is added, renamed or starts throwing, and the summary quietly loses its row;
 * - an export is damaged, from another game version, or not an export at all.
 *
 * None of them needs a real save, so none of them can skip.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const decode = (args: Record<string, unknown>): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>).decode_save!.run(args)) as Promise<Answer>

const REPO = path.join(__dirname, '..', '..')
const MCP = path.join(REPO, 'mcp')
const DIST = path.join(REPO, 'dist')
const FIXTURES = path.join(REPO, 'fixtures', 'save')
const rootOf = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as Record<string, unknown>

/*
 * The fixtures that are exports. The others in the directory are fragments for one reader's
 * maths, which the decoder is right to refuse: it wants one of these four fields at the root.
 */
const EXPORT_MARKERS = ['researchLevel', 'upgradeWorkshopLevel', 'battleHistory', 'inventory']
const fixtures = readdirSync(FIXTURES)
  .filter(name => name.endsWith('.json'))
  .filter(name => EXPORT_MARKERS.some(marker => Array.isArray(rootOf(name)[marker])))

const requireBuilt = createRequire(import.meta.url)
const built = (entry: string): Record<string, unknown> =>
  requireBuilt(entry === 'root' ? path.join(DIST, 'index.js') : path.join(DIST, entry, 'index.js'))

const readers = Object.keys(built('save')).filter(name => /^read[A-Z].*FromSaveRoot$/.test(name))

const scratch = mkdtempSync(path.join(os.tmpdir(), 'decode-save-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
const fileOf = (name: string, content: string | Uint8Array): string => {
  const target = path.join(scratch, name)
  writeFileSync(target, content)
  return target
}

describe('the server only names package members that exist', () => {
  /*
   * Read from the source, not from a call. A handler's `sdk.save.someReader(...)` is only
   * evaluated when that branch of that tool runs, which is how a name that never existed
   * survived a release: the one test that reached it was skipped.
   */
  const named = new Map<string, string>()
  for (const file of readdirSync(MCP).filter(name => name.endsWith('.mjs'))) {
    const source = readFileSync(path.join(MCP, file), 'utf8')
    for (const [, entry, member] of source.matchAll(/\bsdk\.([A-Za-z]+)\.([A-Za-z_$][\w$]*)/g)) {
      named.set(`${entry}.${member}`, file)
    }
  }

  it('finds the references it is meant to check', () => {
    // A refactor that renames `sdk` would leave this audit passing over nothing.
    expect(named.size).toBeGreaterThan(10)
    expect([...named.keys()]).toContain('node.decodePlayerInfoSaveBytesAsync')
  })

  it.each([...named].map(([reference, file]) => ({ reference, file })))(
    'sdk.$reference, named in mcp/$file, is exported by the build',
    ({ reference }) => {
      const [entry, member] = reference.split('.') as [string, string]
      const exported = built(entry)
      expect(Object.hasOwn(exported, member), `sdk.${reference} is not an export of "${entry}"`).toBe(true)
      expect(exported[member]).toBeDefined()
    },
  )
})

describe('decode_save summarises every reader', () => {
  it('has fixtures and readers to work with', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2)
    expect(readers.length).toBeGreaterThan(20)
  })

  it.each(fixtures)('gives one row per reader for %s, and none of them failed', async (fixture) => {
    const answer = await decode({ path: path.join(FIXTURES, fixture) })

    expect(answer.error).toBeUndefined()
    expect(answer.rootKeys).toBe(Object.keys(rootOf(fixture)).length)
    expect(answer.battleRuns).toEqual(expect.any(Number))
    expect(answer.targets.map((row: Answer) => row.extractor)).toEqual(readers)
    expect(answer.targets.filter((row: Answer) => row.error)).toEqual([])

    for (const row of answer.targets as Answer[]) {
      expect(row.found).toEqual(expect.any(Boolean))
      if (!row.found) continue
      expect(row.warnings).toEqual(expect.any(Number))
      expect('count' in row ? row.count : row.fields).toEqual('count' in row ? expect.any(Number) : expect.any(Array))
    }
  })

  it('finds something in every fixture, so a row of all "not found" cannot pass for a summary', async () => {
    for (const fixture of fixtures) {
      const answer = await decode({ path: path.join(FIXTURES, fixture) })
      expect(answer.targets.some((row: Answer) => row.found), fixture).toBe(true)
    }
  })
})

describe('decode_save survives an export that is not what the readers expect', () => {
  /*
   * Every key the fixtures use, each holding the wrong kind of value. A game update that changes
   * a field's type is the ordinary way a reader meets this, and one reader throwing must cost its
   * own row, never the answer.
   */
  const keys = [...new Set(fixtures.flatMap(name => Object.keys(rootOf(name))))]
  const wrong: Record<string, unknown> = {
    null: null,
    text: 'x',
    number: 5,
    negative: -1,
    boolean: true,
    'empty-list': [],
    'mixed-list': [null, 'x', {}, [], 1.5, -3],
    'empty-object': {},
    'nested-object': { a: { b: [1, { c: null }] } },
  }

  it.each(Object.keys(wrong))('answers with a row per reader when every field is %s', async (kind) => {
    const root = { ExportVersion: 1, ...Object.fromEntries(keys.map(key => [key, wrong[kind]])) }
    const answer = await decode({ path: fileOf(`wrong-${kind}.json`, JSON.stringify(root)) })

    // Either the decoder refuses the file in a sentence, or every reader still answers.
    if (answer.error) {
      expect(answer.error).toEqual(expect.any(String))
      expect(answer.error).not.toMatch(/is not a function|Cannot read prop|undefined/)
      return
    }
    expect(answer.targets.map((row: Answer) => row.extractor)).toEqual(readers)
    expect(answer.targets.filter((row: Answer) => row.error)).toEqual([])
  })
})

describe('decode_save explains a file it cannot read', () => {
  const sample = readFileSync(path.join(FIXTURES, fixtures[0]!), 'utf8')
  const cases: [string, () => string][] = [
    ['a missing file', () => path.join(scratch, 'not-there.json')],
    ['a directory', () => scratch],
    ['an empty file', () => fileOf('empty.json', '')],
    ['text that is not JSON', () => fileOf('garbage.json', 'not json')],
    ['an export cut short', () => fileOf('cut.json', sample.slice(0, Math.floor(sample.length / 2)))],
    ['a JSON list', () => fileOf('list.json', '[]')],
    ['JSON null', () => fileOf('null.json', 'null')],
    ['an object with no save data', () => fileOf('object.json', '{}')],
    ['binary data', () => fileOf('binary.dat', Uint8Array.from({ length: 512 }, (_, index) => (index * 37) % 256))],
  ]

  it.each(cases)('says what is wrong with %s, in one line', async (_label, make) => {
    const target = make()
    const answer = await decode({ path: target })

    expect(answer.targets).toBeUndefined()
    expect(answer.error).toEqual(expect.any(String))
    expect(answer.error).toContain(target)
    // A schema error's message is its issue list as indented JSON; a caller gets the sentence.
    expect(answer.error).not.toMatch(/\n|"code"|\[\s*\{/)
    expect(answer.error).not.toMatch(/is not a function|Cannot read prop|undefined/)
  })

  it('refuses a non-text path without touching the disk', async () => {
    for (const bad of [42, {}, [], true]) {
      const answer = await decode({ path: bad })
      expect(answer.error, String(bad)).toMatch(/must be text/)
      expect(answer.searched, String(bad)).toBeUndefined()
    }
  })

  /*
   * A missing path used to be refused outright. It now means "find my export", so the answer on a
   * machine with no export is still an error, but one that says where it looked. The home folder
   * and TOWER_TOOL_EXPORT are pointed away for the call, or this would read the developer's own
   * export on a Mac that has the game installed.
   */
  it('looks for the export when no path is given, and says where it looked', async () => {
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, TOWER_TOOL_EXPORT: process.env.TOWER_TOOL_EXPORT }
    process.env.HOME = scratch
    process.env.USERPROFILE = scratch
    delete process.env.TOWER_TOOL_EXPORT
    try {
      for (const missing of [undefined, null, '', '   ']) {
        const answer = await decode({ path: missing })
        expect(answer.error, String(missing)).toMatch(/no tool_export\.json was found/)
        expect(answer.searched, String(missing)).toEqual(expect.any(Array))
      }
    }
    finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('reads a path that begins with ~ from the home directory', async () => {
    const answer = await decode({ path: '~/no-such-export-for-the-decode-save-test.json' })
    expect(answer.error).toContain(os.homedir())
    expect(answer.error).not.toContain('~')
  })

  it('says a relative path is relative, and to what', async () => {
    const answer = await decode({ path: 'no-such-export.json' })
    expect(answer.error).toContain('no file at')
    expect(answer.hint).toContain(process.cwd())
  })
})

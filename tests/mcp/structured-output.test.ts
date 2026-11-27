/**
 * Every tool says what its answer looks like, and then answers that way.
 *
 * A client that is sent an `outputSchema` may validate `structuredContent` against it and reject
 * the call when it does not fit, so a schema that is slightly wrong is worse than none: the tool
 * works and the client reports that it failed. The schemas are hand-written, which means the only
 * thing keeping them true is calling the tools and checking.
 *
 * So this spawns the server and speaks the protocol, as `what-a-client-actually-receives` does,
 * and holds each answer to the schema that was listed for it. The read-only tools are called
 * against fixtures. The four that write are called too, the way that suite calls them: into a
 * directory made for the purpose, because a schema nobody has checked is the thing this file
 * exists to prevent.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS, TOWER_ORACLE_TOOLS } from '../../mcp/server.mjs'
// @ts-expect-error — as above.
import { OUTPUT_SCHEMAS, WITHOUT_OUTPUT_SCHEMA } from '../../mcp/output-schemas.mjs'
// @ts-expect-error — as above.
import { schemaProblems as untypedSchemaProblems } from '../../mcp/schema-problems.mjs'
import { DIST, FIXTURES, MCP, PACKAGE_ROOT } from '../helpers/paths'

interface JsonSchema { type?: string | string[], properties?: Record<string, JsonSchema>, required?: string[], items?: JsonSchema }
const schemaProblems = untypedSchemaProblems as (schema: JsonSchema, value: unknown) => string[]

const BUILT = existsSync(path.join(DIST, 'index.js'))
const schemas = OUTPUT_SCHEMAS as Record<string, JsonSchema>
const unschemaed = WITHOUT_OUTPUT_SCHEMA as Set<string>
const everyName = [...Object.keys(TOOLS as object), ...Object.keys(TOWER_ORACLE_TOOLS as object)]

const LABS = path.join(FIXTURES, 'save', 'labs-keys.sample.json')
const WORKSHOP = path.join(FIXTURES, 'save', 'workshop-keys.sample.json')
const ABSENT = path.join(FIXTURES, 'save', 'absent.json')

const flags = (length: number, set: number) => Array.from({ length }, (_, index) => index < set)

/**
 * An export with balances, unlock flags and a history of runs.
 *
 * The shipped fixtures hold no runs, so with them alone `battle_history` and `save_series` only
 * ever answered with an empty list, and the fields a real account fills were never checked.
 */
const EXPORT = {
  ExportVersion: 1,
  ExportedAt: '2026-11-24T09:30:00.000Z',
  VersionNumber: 1296,
  DataVersion: 35,
  CurrentTier: 7,
  Coins: 600_000_000,
  Stones: 1800,
  Gems: 500,
  UpgradeTierUnlocked: flags(12, 5),
  UpgradeDefenseTierUnlocked: flags(12, 8),
  UpgradeUtilityTierUnlocked: flags(12, 6),
  UltimateWeaponUnlocked: flags(9, 6),
  UltimateWeaponPlusUnlocked: flags(9, 0),
  ResearchLevel: Array.from({ length: 260 }, (_, index) => (index === 23 ? 57 : 0)),
  ResearchPercentComplete: Array.from({ length: 260 }, () => 0),
  ResearchCompleteDate: Array.from({ length: 260 }, (_, index) =>
    index === 23 ? '2026-11-24T16:33:14.000Z' : '0001-01-01T00:00:00.000Z'),
  LabsUnlocked: 0,
  LabLevel: [0],
  LabResearchInt: [23],
  LabActiveBool: [true],
  LabSpeedUpSpeed: [2],
  LabSpeedUpRemainingSeconds: [0],
  BattleHistory: [
    { Tier: 5, Wave: 1500, BattleDate: '2026-11-03T10:00:00.000Z', CoinsEarnedThisRound: 9000, RealTimeThisRound: 3600, CellsEarnedThisRound: 55 },
    { Tier: 5, Wave: 1200, BattleDate: '2026-11-01T10:00:00.000Z', CoinsEarnedThisRound: 5000, RealTimeThisRound: 1800, CellsEarnedThisRound: 40 },
    {
      Tier: 6, Wave: 800, BattleDate: '2026-11-02T10:00:00.000Z', CoinsEarnedThisRound: 3000, RealTimeThisRound: 3600,
      /* The one run that took damage, so `survival_rank` has something to fit. */
      DamageTaken: 4e9, DefensePercentBlocked: 6e9, RecoveryPackagesThisRound: 300, RecoveryPackagesRegen: 3e9,
      WavesSkippedThisRound: 80, FreeDefenseUpgradesThisRound: 400, FreeUtilityUpgradesThisRound: 400,
      TotalEnemiesDestroyedThisRound: 50000, TotalBasic: 30000, TotalFast: 8000, TotalTank: 7000, TotalRanged: 5000, TotalBoss: 80,
    },
  ],
  UpgradeWorkshopLevel: Array.from({ length: 20 }, (_, index) => (index === 0 ? 300 : 0)),
  UpgradeWorkshopDefenseLevel: Array.from({ length: 20 }, (_, index) => (index === 0 ? 500 : 0)),
  UpgradeWorkshopUtilityLevel: Array.from({ length: 20 }, () => 0),
  LeagueID: 2,
  TournamentRecords: [
    { TournamentNumber: 317, Date: '2026-11-14T00:00:00.000Z', LeagueID: 2, Wave: 450, Rank: 7 },
    { TournamentNumber: 316, Date: '2026-11-11T00:00:00.000Z', LeagueID: 2, Wave: 430, Rank: 12 },
  ],
  HighestWaveThisTier: [0, 4500, 3200, 0, 1800],
  HighestCoinsEarnedThisTier: [0, 9e9, 4e9, 0, 1e9],
}

type Args = Record<string, unknown>

/**
 * Calls that succeed, several per tool where the answer changes shape with the arguments.
 *
 * `SAVE` stands for the export written in `beforeAll`, whose path is not known until then.
 */
const SAVE = '<the export written for this run>'
const SUCCEEDS: Record<string, Args[]> = {
  list_exports: [{ entry: 'data' }, { entry: 'mechanics', filter: 'crit' }, { entry: 'data', filter: 'zzzzqq' }],
  get_export: [
    { name: 'LAB_CATALOG' },
    { name: 'GLOSSARY', limit: 2 },
    { name: 'MODULE_SUBSTAT_CANONICAL_DATA' },
    { name: 'ABSOLUTE_MAX_MODULE_LEVEL' },
    { name: 'expandAcronym' },
  ],
  find_rows: [{ name: 'LAB_CATALOG', limit: 2 }, { name: 'LAB_CATALOG', search: 'damage', fields: ['name'] }],
  decode_save: [{ path: LABS }, { path: SAVE }],
  run_extractor: [
    { extractor: 'readLabsFromSaveRoot', path: LABS },
    { extractor: 'readWorkshopFromSaveRoot', path: WORKSHOP },
    { extractor: 'readExportInfoFromSaveRoot', path: LABS },
  ],
  read_save_field: [
    { extractor: 'readLabsFromSaveRoot', path: LABS },
    { extractor: 'readLabsFromSaveRoot', path: LABS, field: 'researches', limit: 2 },
    { extractor: 'readLabsFromSaveRoot', path: LABS, field: 'labsUnlocked' },
    { extractor: 'readExportInfoFromSaveRoot', path: LABS },
  ],
  wiki_page: [{ title: 'Cards' }, { title: 'Cards', section: 'Costs' }],
  wiki_search: [{ query: 'cards' }, { query: 'zzzqq' }],
  compliance_contract: [{}],
  define_term: [{ term: 'SR' }, { term: 'zzzz' }, { term: 'SR', domain: 'modules' }],
  plan_effective_path: [
    { family: 'damage', variant: 'coin', steps: 2 },
    { family: 'economy', variant: 'coin', steps: 2 },
    { family: 'health', variant: 'coin', steps: 2 },
    { family: 'regen', variant: 'lab-time', steps: 2 },
    { family: 'economy', variant: 'coin', steps: 2, savePath: SAVE },
    { family: 'economy', variant: 'time', steps: 2, scenarios: [{ name: 'more Golden Tower Bonus', levels: { time: { goldenTowerBonus: 20 } } }] },
  ],
  describe_schema: [{}, { table: 'LAB_CATALOG' }],
  calc_list: [{}, { filter: 'coin' }, { filter: 'zzzzq' }],
  calc_describe: [{ id: 'coinBonus.fromSave' }, { id: 'lab.durationDays' }],
  calc_run: [
    { id: 'format.gameNumber', args: { value: 1e15 } },
    { id: 'lab.durationDays', args: { labKey: 'damage', level: 5 } },
    { id: 'coinBonus.fromSave', savePath: LABS },
    { id: 'coinBonus.fromSave', savePath: SAVE },
  ],
  calc_chart: [{}, { chart: 'uw-stone-costs' }],
  calc_graph: [{}, { filter: 'crit' }, { limit: 2 }],
  patch_notes: [{}, { query: 'death wave' }, { introduced: 'vault' }, { introduced: 'zzzzqq' }, { recent: 2 }],
  battle_history: [{ path: LABS }, { path: WORKSHOP, kind: 'tournament' }, { path: SAVE, limit: 2 }, { path: SAVE, detail: true }],
  next_unlocks: [{ path: LABS }, { path: SAVE }],
  coin_bonus: [
    { path: WORKSHOP, tier: 5 }, { path: SAVE }, { path: SAVE, overrides: { tier: 9 } },
    { path: SAVE, scenarios: [{ name: 'a Dissonant run', dissonanceWave: { tier: 5, wave: 2000 } }, { name: 'misspelt', overrides: { nope: 1 } }] },
  ],
  chart_rows: [{}, { chart: 'vault:upgrades-and-cost:harmony-tree', limit: 2 }],
  chart_series: [{}, { family: 'lab' }, { series: 'lab:primary-module-bonus-cannon:cost', limit: 2 }],
  save_series: [{ path: LABS }, { path: SAVE }, { path: SAVE, series: 'save:battle:coins-per-hour', limit: 2 }],
  survival_rank: [{ path: SAVE, candidates: [{ stat: 'Health', toLevel: 600 }], fitRuns: 1, fitSeeds: 1, seeds: 4 }],
  plan_spending: [{ path: SAVE, survival: false }, { path: SAVE, survival: false, timeZone: 'America/Denver', cellFloor: 10, boostPrices: { 1.5: 15, 2: 100 } }],
  form_calc: [{}, { id: 'bot.upgrade' }, { id: 'bot.upgrade', input: {} }],
  oracle_traps: [{ id: 'workshop' }, { id: 'nope' }],
  oracle_get: [{ id: 'workshop' }, { id: 'nope' }],
  oracle_search: [{ query: 'death wave' }, { query: 'zzzzqq' }],
  oracle_map: [{}, { family: 'workshop', includeSources: true, detail: true }],
  oracle_expand: [{ term: 'GT' }, { term: 'SR' }, { term: 'zzzz' }],
  oracle_brief: [{ mechanic: 'death wave' }, { mechanic: 'zzzzq' }, { mechanic: 'coin bonus' }],
  oracle_footguns: [{}, { mechanic: 'workshop' }, { mechanic: 'zzzq' }],
  oracle_coverage: [{}],
  oracle_contradictions: [{}],
  /* The four that write. Each goes to the scratch directory this suite gives the server. */
  sdk_sandbox_run: [{}, { mode: 'export', name: 'LAB_CATALOG' }, { mode: 'format', value: 1e15 }, { mode: 'calc', id: 'nope' }],
  begin_mechanic_task: [{ mechanic: 'Coin Bonus', intent: 'check the stacking' }],
  record_mechanic_note: [{ token: 'tok', mechanic: 'Coin Bonus', facts: ['a fact'], sources: ['wiki "Coins"'] }],
  record_work_status: [{ token: 'tok', title: 'Coin Bonus', status: 'awaiting_user', summary: 'ready to test' }],
}

/** Tools whose answer names the moment or a fresh token, so two calls never give the same text. */
const WRITES = new Set(['begin_mechanic_task', 'record_mechanic_note', 'record_work_status'])

/** Calls that fail, each a different way a tool says so. */
const FAILS: [string, Args][] = [
  ['get_export', { name: 'NOT_AN_EXPORT' }],
  ['list_exports', { entry: 'nope' }],
  ['decode_save', { path: ABSENT }],
  ['calc_run', { id: 'nope' }],
  ['oracle_map', { family: 'nope' }],
  ['sdk_sandbox_run', { mode: 'nope' }],
  ['record_work_status', { token: 'tok', title: 't', status: 'done', summary: 's' }],
  ['wiki_search', { query: 42 }],
  ['coin_bonus', { path: LABS, savePath: LABS }],
  ['no_such_tool', {}],
]

describe('the output schemas', () => {
  it('gives every tool one, or names it as deliberately without', () => {
    expect(everyName.filter(name => !schemas[name] && !unschemaed.has(name))).toEqual([])
    expect(everyName.filter(name => schemas[name] && unschemaed.has(name))).toEqual([])
    expect([...Object.keys(schemas), ...unschemaed].filter(name => !everyName.includes(name))).toEqual([])
  })

  it('describes an object at the top, which is all structured content can be', () => {
    for (const [name, schema] of Object.entries(schemas)) expect(schema.type, name).toBe('object')
  })

  it('is checked by something that can say no', () => {
    const schema = schemas.list_exports!
    const good = { entry: 'data', total: 2, matched: 1, exports: [{ name: 'A', type: 'number' }] }
    expect(schemaProblems(schema, good)).toEqual([])
    expect(schemaProblems(schema, { ...good, total: '2' })).toEqual(['$.total: expected number, got string'])
    expect(schemaProblems(schema, { ...good, exports: [{ name: 'A' }] })).toEqual(['$.exports[0]: `type` is required'])
    expect(schemaProblems(schema, [good])).toEqual(['$: expected object, got array'])
    expect(schemaProblems(schema, { error: 'no entry "nope"' }).length).toBeGreaterThan(0)
  })

  it('travels with the tool, so a server that mounts the registry advertises it', () => {
    const registries = { ...(TOOLS as object), ...(TOWER_ORACLE_TOOLS as object) } as Record<string, { outputSchema?: JsonSchema }>
    for (const name of Object.keys(schemas)) expect(registries[name]!.outputSchema, name).toBe(schemas[name])
    for (const name of unschemaed) expect(registries[name]!.outputSchema, name).toBeUndefined()
  })

  it('has a call here for every tool that has a schema', () => {
    expect(Object.keys(schemas).filter(name => !SUCCEEDS[name]?.length)).toEqual([])
  })
})

interface Reply {
  result?: {
    isError?: boolean
    content?: { type: string, text: string }[]
    structuredContent?: unknown
    tools?: { name: string, outputSchema?: JsonSchema }[]
  }
}

describe.skipIf(!BUILT)('structured output over stdio', () => {
  let scratch: string
  let save: string
  const servers: ChildProcessWithoutNullStreams[] = []

  /** A server of its own, because the revision a connection agreed on is state it keeps. */
  const connect = () => {
    const child = spawn(process.execPath, [path.join(MCP, 'server.mjs')], {
      cwd: PACKAGE_ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        TOWER_MECHANICS_MAP_DIR: path.join(scratch, 'map'),
        TOWER_WIKI_DIR: path.join(scratch, 'wiki'),
        TOWER_WIKI_OFFLINE: '1',
        TOWER_TOOL_EXPORT: '',
        /* An answer outside its schema is refused, so every call in this file checks one. */
        TOWER_MCP_STRICT: '1',
      },
    })
    servers.push(child)
    let nextId = 1
    let buffer = ''
    const waiting = new Map<number, (reply: Reply) => void>()
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
    const rpc = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Reply>((resolve) => {
        const id = nextId++
        waiting.set(id, resolve)
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      })
    const call = async (name: string, args: Args) => {
      const filled = Object.fromEntries(Object.entries(args).map(([key, value]) => [key, value === SAVE ? save : value]))
      return (await rpc('tools/call', { name, arguments: filled })).result!
    }
    return { rpc, call }
  }

  let current: ReturnType<typeof connect>
  let older: ReturnType<typeof connect>
  let unnegotiated: ReturnType<typeof connect>

  beforeAll(async () => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'tower-mcp-structured-'))
    save = path.join(scratch, 'tool_export.json')
    writeFileSync(save, JSON.stringify(EXPORT))
    mkdirSync(path.join(scratch, 'wiki'))
    writeFileSync(path.join(scratch, 'wiki', 'cards.md'), '# Cards\n\nWhat a card is.\n\n## Costs\n\nWhat a card costs.\n')

    current = connect()
    older = connect()
    unnegotiated = connect()
    await current.rpc('initialize', { protocolVersion: '2025-06-18' })
    await older.rpc('initialize', { protocolVersion: '2025-03-26' })
  })

  afterAll(() => {
    for (const child of servers) child.kill()
    rmSync(scratch, { recursive: true, force: true })
  })

  it('lists a schema with every tool that has one', async () => {
    const listed = (await current.rpc('tools/list')).result!.tools!
    expect(listed.length).toBeGreaterThan(30)
    for (const tool of listed) {
      if (unschemaed.has(tool.name)) expect(tool.outputSchema, tool.name).toBeUndefined()
      else expect(tool.outputSchema, tool.name).toEqual(schemas[tool.name])
    }
  })

  it.each(Object.entries(SUCCEEDS))('%s answers as its schema says', async (name, calls) => {
    for (const args of calls) {
      const at = `${name} ${JSON.stringify(args)}`
      const result = await current.call(name, args)
      expect(result, at).toBeDefined()
      expect(result.isError, `${at}: ${result.content?.[0]?.text.slice(0, 300)}`).toBeUndefined()
      expect(schemaProblems(schemas[name]!, result.structuredContent), at).toEqual([])
      /* The text block is the same answer, serialised: a client reading either gets one result. */
      expect(result.structuredContent, at).toEqual(JSON.parse(result.content![0]!.text))
      /* And a client that negotiated an older revision, or none, reads the very same text. */
      for (const client of [older, unnegotiated]) {
        const plain = await client.call(name, args)
        expect(plain, at).not.toHaveProperty('structuredContent')
        if (!WRITES.has(name)) expect(plain.content, at).toEqual(result.content)
      }
    }
  })

  it.each(FAILS)('%s, failing, sends its explanation as text alone', async (name, args) => {
    const result = await current.call(name, args)
    expect(result.isError).toBe(true)
    expect(result.content![0]!.text.length).toBeGreaterThan(0)
    expect(result).not.toHaveProperty('structuredContent')
  })

  it('lists no schema for a client on an older revision, or one that never negotiated', async () => {
    for (const client of [older, unnegotiated]) {
      for (const tool of (await client.rpc('tools/list')).result!.tools!) {
        expect(tool, tool.name).not.toHaveProperty('outputSchema')
      }
      expect(Object.keys(await client.call('get_export', { name: 'LAB_CATALOG', limit: 1 }))).toEqual(['content'])
    }
  })
})

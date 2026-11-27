/**
 * `plan_spending` answers from a save: it runs the planning tools in order and returns one
 * answer. Checked against the SDK called directly, on a small export written for the test and
 * with the trimmed fixture folder as stored readings.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodePlayerInfoSaveBytes, readSurvivalSnapshotDirectory } from '@beardedunicorn/thetowersdk/node'
import { planSpendingFromSave } from '@beardedunicorn/thetowersdk/save'
import fixture from '../../fixtures/save/planning-t7.snapshots.json'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const tools = TOOLS as Record<string, { run: (a: unknown) => unknown }>
const run = (args: Record<string, unknown> = {}): Promise<Answer> => Promise.resolve(tools.plan_spending!.run(args)) as Promise<Answer>

const levels = (length: number, set: Record<number, number>) => Array.from({ length }, (_, index) => set[index] ?? 0)
const farmRun = (date: string, coins: number, cells: number) => ({
  Tier: 7, Wave: 2000, BattleDate: date, RealTimeThisRound: 10_800, GameplayTimeThisRound: 50_000, CoinsEarnedThisRound: coins, CellsEarnedThisRound: cells, KilledBy: 4,
})

/** A small account: three full farm runs in the day before the export, one lab running, coins and cells on hand. */
const EXPORT = {
  ExportVersion: 1,
  ExportedAt: '2026-11-27T00:00:00.000Z',
  VersionNumber: 1301,
  DataVersion: 35,
  CurrentTier: 7,
  Coins: 5e9,
  Cells: 10_000,
  UltimateWeaponUnlocked: Array.from({ length: 9 }, () => true),
  UpgradeWorkshopLevel: levels(20, { 0: 800 }),
  UpgradeWorkshopDefenseLevel: levels(20, { 0: 1300 }),
  UpgradeWorkshopUtilityLevel: levels(20, {}),
  ResearchLevel: levels(260, { 60: 13 }),
  ResearchPercentComplete: levels(260, {}),
  ResearchCompleteDate: Array.from({ length: 260 }, (_, index) => (index === 60 ? '2026-11-27T10:00:00.000Z' : '0001-01-01T00:00:00.000Z')),
  LabsUnlocked: 0,
  LabLevel: [0],
  LabResearchInt: [60],
  LabActiveBool: [true],
  LabSpeedUpSpeed: [1],
  LabSpeedUpRemainingSeconds: [0],
  BattleHistory: [
    farmRun('2026-11-26T06:00:00.000Z', 2.4e9, 3000),
    farmRun('2026-11-26T12:00:00.000Z', 3.0e9, 3300),
    farmRun('2026-11-26T20:00:00.000Z', 2.7e9, 3600),
  ],
}

let directory: string
let savePath: string
let snapshotsDir: string

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-spending-'))
  savePath = path.join(directory, 'tool_export.json')
  fs.writeFileSync(savePath, JSON.stringify(EXPORT))
  snapshotsDir = path.join(directory, 'snapshots')
  fs.mkdirSync(snapshotsDir)
  fixture.snapshots.forEach((snapshot, index) => {
    fs.writeFileSync(path.join(snapshotsDir, `reading-${index}.json`), JSON.stringify(snapshot))
  })
})

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('plan_spending', () => {
  it('forecasts from the save\'s own runs: the median rate times the hours run', async () => {
    const answer = await run({ path: savePath, survival: false })
    expect(answer.error).toBeUndefined()
    expect(answer.now).toBe('2026-11-27T00:00:00.000Z')
    expect(answer.coins).toBe(5e9)
    // Three 3-hour runs: 0.8B, 1.0B and 0.9B an hour, nine hours in the last day.
    expect(answer.forecast.coinsPerHour.median).toBeCloseTo(0.9e9, 0)
    expect(answer.forecast.hoursPerDay).toBeCloseTo(9, 9)
    expect(answer.forecast.coinsPerDay.median).toBeCloseTo(8.1e9, 0)
    expect(answer.forecast.cellsPerDay.median).toBeCloseTo(9900, 6)
    expect(answer.coinModel.passThrough).toBe(1)
  })

  it('returns what the SDK returns, part for part', async () => {
    const answer = await run({ path: savePath, survival: false, timeZone: 'America/Denver', cellFloor: 2000 })
    const root = decodePlayerInfoSaveBytes(fs.readFileSync(savePath)).parsedRoot
    const direct = planSpendingFromSave({ save: root, timeZone: 'America/Denver', cellFloor: 2000, includeSurvival: false })!
    expect(answer.labQueue).toEqual(JSON.parse(JSON.stringify(direct.labQueue.slice(0, 20))))
    expect(answer.labSchedule.rows).toEqual(JSON.parse(JSON.stringify(direct.labSchedule!.rows)))
    expect(answer.boostPolicy.policy).toEqual(direct.boostPolicy!.policy)
    expect(answer.labSchedule.timeZone).toBe('America/Denver')
    expect(answer.notes.join(' ')).toMatch(/never recommended/)
  })

  it('plays the running lab forward from the save, and keeps labs off the coin queue', async () => {
    // Ten unboosted hours are left. With no boost allowed the lab ends then; with the 2x the cell
    // income sustains, in half the time.
    const unboosted = await run({ path: savePath, survival: false, maxBoost: 1 })
    expect(unboosted.labSchedule.rows[0]).toMatchObject({ slot: 0, lab: 'Golden Tower Bonus', toLevel: 14, start: null, finish: '2026-11-27T10:00:00.000Z', permanent: true })
    const answer = await run({ path: savePath, survival: false })
    expect(answer.boostPolicy.policy).toEqual([{ slot: 0, multiplier: 2, cellsPerDay: 2400 }])
    expect(answer.labSchedule.rows[0].finish).toBe('2026-11-27T05:00:00.000Z')
    expect(answer.labQueue.length).toBeGreaterThan(0)
    expect(answer.labQueue.every((row: Answer) => row.kind === 'lab' && row.permanent === true)).toBe(true)
    expect(answer.coinQueue.every((row: Answer) => row.kind !== 'lab')).toBe(true)
    // Golden Tower Bonus is researching level 14, so the queue offers 15, not 14.
    expect(answer.labQueue.find((row: Answer) => row.lab === 'Golden Tower Bonus')?.toLevel).toBe(15)
    expect(answer.notRanked.map((row: Answer) => row.candidate)).toContain('Module slot levels')
    // A lab never researched and behind a milestone this account has not reached is explained, not offered.
    expect(answer.notRanked.find((row: Answer) => row.candidate === 'Golden Tower Duration 1')?.reason).toMatch(/tier 4 wave 200 milestone/)
  })

  it('uses the caller\'s boost prices and says when it used the wiki\'s', async () => {
    const wiki = await run({ path: savePath, survival: false })
    expect(wiki.boostPolicy.warnings.join(' ')).toMatch(/not confirmed in game/)
    const own = await run({ path: savePath, survival: false, boostPrices: { 1.5: 10, 2: 50 } })
    expect(own.boostPolicy.warnings.join(' ')).not.toMatch(/not confirmed in game/)
    expect(own.boostPolicy.policy[0]).toEqual({ slot: 0, multiplier: 2, cellsPerDay: 1200 })
  })

  it('reads stored readings from a folder and ignores those taken after the save', async () => {
    const answer = await run({ path: savePath, survival: false, snapshotsDir })
    expect(answer.error).toBeUndefined()
    expect(readSurvivalSnapshotDirectory(snapshotsDir).snapshots).toHaveLength(fixture.snapshots.length)
    // The fixture's runs are older than this save's, so its history joins the forecast's hours.
    expect(answer.forecast.uptime.at(-1).days).toBeGreaterThan(10)
    expect(answer.forecast.regimeBreaks.length).toBeGreaterThan(0)
  })

  it('refuses what it cannot use, by name', async () => {
    expect((await run({ path: savePath, nope: 1 })).error).toBeDefined()
    expect((await run({ path: savePath, boostPrices: { 1: 5 } })).error).toMatch(/boostPrices/)
    expect((await run({ path: savePath, workshopTargets: [{ stat: 'Health' }] })).error).toMatch(/workshopTargets/)
    expect((await run({ path: savePath, snapshotsDir: path.join(directory, 'missing') })).error).toMatch(/no usable readings/)
    expect((await run({ path: path.join(directory, 'absent.json') })).error).toBeDefined()
  })
})

describe('scenario lists', () => {
  it('coin_bonus prices several what-ifs against the save in one call', async () => {
    const answer = await Promise.resolve(tools.coin_bonus!.run({
      path: savePath, tier: 7,
      scenarios: [{ name: 'to 2000', dissonanceWave: { tier: 7, wave: 2000 } }, { name: 'to 3000', dissonanceWave: { tier: 7, wave: 3000 } }, { name: 'misspelt', overrides: { nope: 1 } }],
    })) as Answer
    expect(answer.scenarios.map((row: Answer) => row.name)).toEqual(['to 2000', 'to 3000', 'misspelt'])
    expect(answer.scenarios[0].ratioToNow).toBeGreaterThan(1)
    expect(answer.scenarios[1].ratioToNow).toBeGreaterThan(answer.scenarios[0].ratioToNow)
    expect(answer.scenarios[0].total).toBeCloseTo(answer.bonus.total * answer.scenarios[0].ratioToNow, 6)
    expect(answer.scenarios[2]).toMatchObject({ total: null })
    expect(answer.scenarios[2].error).toMatch(/no field "nope"/)
    expect(((await Promise.resolve(tools.coin_bonus!.run({ path: savePath, scenarios: [] }))) as Answer).error).toMatch(/scenarios/)
  })

  it('plan_effective_path plans again under each scenario, beside the plan without it', async () => {
    const answer = await Promise.resolve(tools.plan_effective_path!.run({
      family: 'economy', variant: 'time', steps: 3, savePath,
      scenarios: [{ name: 'Golden Tower Bonus maxed out of the way', levels: { time: { goldenTowerBonus: 25 } } }],
    })) as Answer
    expect(answer.steps).toHaveLength(3)
    expect(answer.scenarios).toHaveLength(1)
    expect(answer.scenarios[0].steps).toHaveLength(3)
    const base = answer.steps.find((step: Answer) => step.name === 'Golden Tower Bonus')
    const changed = answer.scenarios[0].steps.find((step: Answer) => step.name === 'Golden Tower Bonus')
    expect(base?.level ?? 0).toBeLessThanOrEqual(25)
    if (changed) expect(changed.level).toBeGreaterThan(25)
    expect(((await Promise.resolve(tools.plan_effective_path!.run({ family: 'economy', variant: 'time', scenarios: [{ name: 'x' }] }))) as Answer).error).toMatch(/scenarios/)
  })
})

/**
 * `survival_rank` answers from a save: it fits the save's own runs, ranks the candidates and
 * returns the fit beside the ranking. Checked against the SDK called directly, on a small export
 * written for the test and on the trimmed fixture folder as stored readings.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeWorkshopUpgradePrice } from '@beardedunicorn/thetowersdk/data'
import { readSurvivalSnapshotDirectory } from '@beardedunicorn/thetowersdk/node'
import fixture from '../../fixtures/save/survival-t7.snapshots.json'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const run = (args: Record<string, unknown> = {}): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>).survival_rank!.run(args)) as Promise<Answer>

const levels = (length: number, set: Record<number, number>) => Array.from({ length }, (_, index) => set[index] ?? 0)

/** A small account: workshop levels and two short tier-3 runs that took damage. */
const EXPORT = {
  ExportVersion: 1,
  ExportedAt: '2026-11-24T09:30:00.000Z',
  VersionNumber: 1296,
  DataVersion: 35,
  CurrentTier: 3,
  UpgradeWorkshopLevel: levels(20, { 0: 200 }),
  /* Health, Health Regen, Defense %, Defense Absolute. */
  UpgradeWorkshopDefenseLevel: levels(20, { 0: 300, 1: 100, 2: 40, 3: 50 }),
  UpgradeWorkshopUtilityLevel: levels(20, {}),
  BattleHistory: [
    {
      Tier: 3, Wave: 420, BattleDate: '2026-11-22T10:00:00.000Z', RealTimeThisRound: 3000,
      DamageTaken: 4.0e7, DefensePercentBlocked: 3.0e7, RecoveryPackagesThisRound: 120, RecoveryPackagesRegen: 3.0e7,
      WavesSkippedThisRound: 40, FreeDefenseUpgradesThisRound: 210, FreeUtilityUpgradesThisRound: 205,
      TotalEnemiesDestroyedThisRound: 20000, TotalBasic: 12000, TotalFast: 3000, TotalTank: 3000, TotalRanged: 2000, TotalBoss: 40,
    },
    {
      Tier: 3, Wave: 380, BattleDate: '2026-11-23T10:00:00.000Z', RealTimeThisRound: 2800,
      DamageTaken: 3.0e7, DefensePercentBlocked: 2.4e7, RecoveryPackagesThisRound: 110, RecoveryPackagesRegen: 2.4e7,
      WavesSkippedThisRound: 36, FreeDefenseUpgradesThisRound: 190, FreeUtilityUpgradesThisRound: 188,
      TotalEnemiesDestroyedThisRound: 18000, TotalBasic: 11000, TotalFast: 2700, TotalTank: 2600, TotalRanged: 1700, TotalBoss: 36,
    },
  ],
}

let directory: string
let savePath: string
let snapshotsDir: string

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'survival-rank-'))
  savePath = path.join(directory, 'tool_export.json')
  fs.writeFileSync(savePath, JSON.stringify(EXPORT))
  snapshotsDir = path.join(directory, 'snapshots')
  fs.mkdirSync(snapshotsDir)
  fixture.snapshots.forEach((snapshot, index) => {
    fs.writeFileSync(path.join(snapshotsDir, `reading-${index}.json`), JSON.stringify(snapshot))
  })
  fs.writeFileSync(path.join(snapshotsDir, 'notes.json'), JSON.stringify({ hello: 'not a reading' }))
  /* Written in one millisecond the files tie and fall back to name order, so date them a second apart. */
  const names = [...fixture.snapshots.map((_, index) => `reading-${index}.json`), 'notes.json']
  names.forEach((name, index) => fs.utimesSync(path.join(snapshotsDir, name), 1_700_000_000 + index, 1_700_000_000 + index))
})

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('survival_rank', () => {
  it('fits the save\'s runs, ranks the candidates and prices them as the workshop does', async () => {
    const answer = await run({
      path: savePath,
      candidates: [{ stat: 'Health', toLevel: 400 }, { stat: 'Defense Absolute', toLevel: 150 }],
      fitSeeds: 2,
      seeds: 20,
    })
    expect(answer.error).toBeUndefined()
    expect(answer.path).toBe(savePath)
    expect(answer.tier).toBe(3)
    expect(answer.mode).toBe('afk')
    expect(answer.fit.runsUsed).toBe(2)
    expect(answer.fit.perRun.map((r: Answer) => r.wave)).toEqual([420, 380])
    expect(typeof answer.fit.leaveOneOutError).toBe('number')
    expect(answer.baseline.p10).toBeLessThanOrEqual(answer.baseline.median)

    expect(answer.ranked).toHaveLength(2)
    const health = answer.ranked.find((u: Answer) => u.stat === 'Health')
    expect(health.fromLevel).toBe(300)
    expect(health.toLevel).toBe(400)
    expect(health.coins).toBe(computeWorkshopUpgradePrice('Health', 300, 100)?.coins)
    expect(health.medianWavesGained).toBeGreaterThan(0)
    expect(health.wavesPerBillionCoins).toBeCloseTo(health.medianWavesGained / (health.coins / 1e9), 6)
  }, 60_000)

  it('says how far to trust the ranking, and that runs were taken as AFK', async () => {
    const answer = await run({ path: savePath, candidates: [{ stat: 'Health', toLevel: 400 }], fitSeeds: 2, seeds: 4 })
    expect(answer.notes.join(' ')).toMatch(/Leave-one-out/)
    expect(answer.notes.join(' ')).toMatch(/AFK/)
    expect(answer.warnings.join(' ')).toMatch(/no stored snapshots/)
    expect(answer.assumptions).toHaveProperty('lifestealActive')
  }, 60_000)

  it('refuses an upgrade the model does not read, by name', async () => {
    const answer = await run({ path: savePath, candidates: [{ stat: 'Damage', toLevel: 900 }] })
    expect(answer.error).toMatch(/"Damage" is not an upgrade the survival model reads/)
    expect(answer.stats).toContain('Recovery Amount')
  })

  it('refuses a missing candidate list, a bad level, a bad mode and an argument it does not read', async () => {
    expect((await run({ path: savePath })).error).toMatch(/candidates must be a list/)
    expect((await run({ path: savePath, candidates: [{ stat: 'Health', toLevel: 1.5 }] })).error).toMatch(/whole level/)
    expect((await run({ path: savePath, candidates: [{ stat: 'Health', toLevel: 400 }], mode: 'idle' })).error).toMatch(/afk/)
    expect((await run({ path: savePath, candidates: [], seed: 3 })).error).toMatch(/does not read "seed"/)
  })

  it('explains a snapshot folder with nothing usable in it', async () => {
    const answer = await run({ path: savePath, candidates: [{ stat: 'Health', toLevel: 400 }], snapshotsDir: path.join(directory, 'absent') })
    expect(answer.error).toMatch(/no usable readings/)
    expect(answer.warnings.join(' ')).toMatch(/could not list/)
  })
})

describe('readSurvivalSnapshotDirectory', () => {
  it('reads the stored readings and names the file it skipped', () => {
    const read = readSurvivalSnapshotDirectory(snapshotsDir)
    expect(read.snapshots).toHaveLength(fixture.snapshots.length)
    expect(read.files).toHaveLength(fixture.snapshots.length)
    expect(read.warnings.join(' ')).toMatch(/notes\.json/)
  })

  it('reads only the most recent files when told to, and says so', () => {
    /* The three most recently written files are two readings and the note, which is skipped. */
    const read = readSurvivalSnapshotDirectory(snapshotsDir, { limit: 3 })
    expect(read.snapshots).toHaveLength(2)
    expect(read.warnings.join(' ')).toMatch(/only the 3 most recent/)
    expect(read.warnings.join(' ')).toMatch(/notes\.json/)
  })

  it('never throws on a folder it cannot list', () => {
    const read = readSurvivalSnapshotDirectory(path.join(directory, 'absent'))
    expect(read.snapshots).toEqual([])
    expect(read.warnings[0]).toMatch(/could not list/)
  })
})

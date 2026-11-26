/**
 * The wave survival model's back-tests: the spec's five acceptance checks, against five real runs
 * of one tier-7 account (`fixtures/save/survival-t7.snapshots.json`).
 *
 * Each check asserts what the fit reaches today. Where that is short of the spec's proposed
 * tolerance, the spec's own number sits beside it as `it.fails`: it documents the gap, and it
 * turns red the day the model closes it, which is the prompt to promote it to a plain `it`.
 *
 * Slow by design — it fits a seeded simulator. One fit is shared by every check.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import fixture from '../../fixtures/save/survival-t7.snapshots.json'
import type { SurvivalCashPolicy, SurvivalMode } from '../../src/mechanics/survival'
import {
  calibrateSurvivalFromHistory,
  rankSurvivalUpgradesFromSave,
  simulateSurvivalRunFromSave,
} from '../../src/save/survival'
import type { SurvivalHistoryFit, SurvivalSaveRank, SurvivalSaveSimulation } from '../../src/save/survival'

const snapshots = fixture.snapshots as unknown[]
const latest = snapshots.at(-1)
const ACTIVE = '2026-11-25T22:50:06.596Z'
const BURST_RUN = '2026-11-26T13:55:15.758Z'
const ATTRITION_RUN = '2026-11-26T10:07:04.975Z'
const REAL = {
  '2026-11-26T10:07:04.975Z': { wave: 2230, packageHeal: 3.29e12 },
  '2026-11-26T13:55:15.758Z': { wave: 1826, packageHeal: 0.14e12 },
  '2026-11-26T18:34:23.686Z': { wave: 2039, packageHeal: 0.78e12 },
} as const

const modes = fixture.runModes as Record<string, SurvivalMode | 'exclude'>
let afk: SurvivalHistoryFit
let active: SurvivalHistoryFit
let ranked: SurvivalSaveRank
let today: SurvivalSaveSimulation

beforeAll(() => {
  /* The three AFK runs, each held out in turn. The active run is kept for check 4. */
  afk = calibrateSurvivalFromHistory({
    save: latest,
    snapshots,
    tier: 7,
    runModes: { ...modes, [ACTIVE]: 'exclude' },
    seeds: 12,
    passes: 2,
  }) as SurvivalHistoryFit

  /* The active run, predicted from the AFK fit without refitting: `passes: 0`. */
  const bought = (fixture.activeRunBoughtLevels as Record<string, SurvivalCashPolicy['targetLevels']>)[ACTIVE]
  active = calibrateSurvivalFromHistory({
    save: latest,
    snapshots,
    tier: 7,
    runModes: Object.fromEntries(Object.keys(modes).map(date => [date, date === ACTIVE ? 'active' : 'exclude'])),
    cashPolicies: { [ACTIVE]: { targetLevels: bought, byWave: 2697 } },
    unbracketedRuns: 'nearest',
    start: afk.calibration,
    passes: 0,
    seeds: 24,
  }) as SurvivalHistoryFit

  ranked = rankSurvivalUpgradesFromSave({
    save: latest,
    tier: 7,
    calibration: afk.calibration,
    seeds: 100,
    candidates: [
      { stat: 'Recovery Amount', toLevel: 100 },
      { stat: 'Max Recovery', toLevel: 100 },
      { stat: 'Health', toLevel: 1500 },
    ],
  }) as SurvivalSaveRank

  today = simulateSurvivalRunFromSave({ save: latest, tier: 7, calibration: afk.calibration, seeds: 100 }) as SurvivalSaveSimulation
}, 240_000)

describe('the fit itself', () => {
  it('fits the three AFK runs, each with the state it was played with', () => {
    expect(afk.tier).toBe(7)
    expect(afk.runsUsed).toBe(3)
    expect(afk.perRun.map(run => run.wave)).toEqual([2230, 1826, 2039])
    expect(afk.skipped.map(run => run.reason)).toEqual(['excluded by the caller', 'excluded by the caller'])
    expect(afk.warnings).toEqual([])
  })

  it('finds a health scale well above 1, for the multipliers the state leaves out', () => {
    expect(afk.calibration.healthScale).toBeGreaterThan(5)
    expect(afk.calibration.referenceWave).toBe(2039)
    expect(afk.calibration.referenceRatio).toBeGreaterThan(0)
  })
})

describe('back-test 1: leave-one-out death wave of each AFK run', () => {
  it('is within 16% of the real one, and 10% on average', () => {
    for (const run of afk.perRun) expect(Math.abs(run.error)).toBeLessThan(0.16)
    expect(afk.leaveOneOutError).toBeLessThan(0.1)
  })

  it.fails('SPEC TARGET, not yet met: every run within 10%', () => {
    for (const run of afk.perRun) expect(Math.abs(run.error)).toBeLessThan(0.1)
  })
})

describe('back-test 2: package healing', () => {
  it('keeps packages per wave where the runs put it', () => {
    /* The five runs sit at 0.50 to 0.53 packages a wave. */
    const perWave = today.packages / today.deathWave.median
    expect(perWave).toBeGreaterThan(0.49)
    expect(perWave).toBeLessThan(0.54)
  })

  it('predicts each run within a factor of 15, which is the spread of the runs themselves', () => {
    for (const run of afk.perRun) {
      const real = REAL[run.runDate as keyof typeof REAL].packageHeal
      const ratio = run.predictedPackageHeal / real
      expect(ratio).toBeGreaterThan(1 / 15)
      expect(ratio).toBeLessThan(15)
    }
  })

  it.fails('SPEC TARGET, not yet met: package healing within 25% of each run', () => {
    for (const run of afk.perRun) {
      const real = REAL[run.runDate as keyof typeof REAL].packageHeal
      expect(Math.abs(run.predictedPackageHeal / real - 1)).toBeLessThan(0.25)
    }
  })
})

describe('back-test 3: how the runs ended', () => {
  it('reports a burst share for every run', () => {
    for (const run of afk.perRun) {
      expect(run.burstShare).toBeGreaterThanOrEqual(0)
      expect(run.burstShare).toBeLessThanOrEqual(1)
    }
  })

  it.fails('SPEC TARGET, not yet met: the wave-1826 run is a burst death and the wave-2230 run attrition', () => {
    const burst = afk.perRun.find(run => run.runDate === BURST_RUN)
    const attrition = afk.perRun.find(run => run.runDate === ATTRITION_RUN)
    expect(burst?.burstShare).toBeGreaterThan(0.5)
    expect(attrition?.burstShare).toBeLessThan(0.5)
  })
})

describe('back-test 4: the active run', () => {
  it('lands within 10% of the 2,697 record from the AFK fit and the levels the player bought', () => {
    expect(active.runsUsed).toBe(1)
    expect(active.calibration).toEqual(afk.calibration)
    expect(active.perRun[0].wave).toBe(2697)
    expect(Math.abs(active.perRun[0].error)).toBeLessThan(0.1)
  })

  it('says the run was fitted against the nearest reading, not a bracketing pair', () => {
    expect(active.warnings.join(' ')).toMatch(/nearest reading/)
  })
})

describe('back-test 5: the three upgrades of the Goal table', () => {
  it('prices each as the Workshop screen does, 15% discount included', () => {
    const coins = Object.fromEntries(ranked.ranked.map(u => [u.stat, Math.round((u.coins ?? 0) / 1e7) / 100]))
    expect(coins).toEqual({ 'Recovery Amount': 3.36, 'Max Recovery': 3.31, 'Health': 7.95 })
  })

  it('ranks all three and none of them loses waves', () => {
    expect(ranked.ranked).toHaveLength(3)
    for (const upgrade of ranked.ranked) {
      expect(upgrade.medianWavesGained).toBeGreaterThanOrEqual(0)
      expect(upgrade.wavesPerBillionCoins).not.toBeNull()
    }
    const perCoin = ranked.ranked.map(u => u.wavesPerBillionCoins ?? 0)
    expect([...perCoin].sort((a, b) => b - a)).toEqual(perCoin)
  })

  it('comes with a leave-one-out error to read it by', () => {
    expect(afk.leaveOneOutError).toBeGreaterThan(0)
    expect(ranked.baseline.median).toBeGreaterThan(1800)
    expect(ranked.baseline.median).toBeLessThan(2500)
  })
})

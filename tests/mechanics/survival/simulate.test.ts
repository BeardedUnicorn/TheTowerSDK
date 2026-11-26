/**
 * Piece 3 of the wave survival model: the spec's five invariants, on fixed seeds.
 *
 * These hold for any calibration, so they run on the placeholder one. Seeded rather than
 * property-tested with a library: the repo has none, and a fixed seed turns a failure into a
 * reproduction.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveSurvivalStats,
  simulateSurvivalRun,
  simulateSurvivalRunOnce,
  simulateSurvivalRunOutcomes,
  survivalPercentiles,
  survivalRunSeed,
} from '../../../src/mechanics/survival'
import type { SurvivalStat } from '../../../src/mechanics/survival'
import { survivalTestState } from '../../helpers/survival-state'

const SEEDS = 60

describe('simulateSurvivalRun', () => {
  it('gives the same result for the same seeds', () => {
    const a = simulateSurvivalRun({ state: survivalTestState(), seeds: SEEDS, baseSeed: 7 })
    const b = simulateSurvivalRun({ state: survivalTestState(), seeds: SEEDS, baseSeed: 7 })
    expect(b).toEqual(a)
  })

  it('gives a different spread for different seeds', () => {
    const a = simulateSurvivalRunOutcomes({ state: survivalTestState(), seeds: 8, baseSeed: 7 }).map(o => o.deathWave)
    const b = simulateSurvivalRunOutcomes({ state: survivalTestState(), seeds: 8, baseSeed: 8 }).map(o => o.deathWave)
    expect(b).not.toEqual(a)
  })

  it('orders its percentiles and reports how runs ended as shares', () => {
    const r = simulateSurvivalRun({ state: survivalTestState(), seeds: SEEDS })
    expect(r.deathWave.p10).toBeLessThanOrEqual(r.deathWave.median)
    expect(r.deathWave.median).toBeLessThanOrEqual(r.deathWave.p90)
    expect(r.endedBy.attrition + r.endedBy.burst + r.endedBy.survived).toBeCloseTo(1, 12)
    expect(r.seeds).toBe(SEEDS)
    expect(r.rows).toBeUndefined()
  })

  it('returns one row per wave of the median run only when asked', () => {
    const r = simulateSurvivalRun({ state: survivalTestState(), seeds: 20, rows: true })
    expect(r.rows).toHaveLength(r.deathWave.median)
    expect(r.rows?.[0].wave).toBe(1)
    expect(r.rows?.at(-1)?.health).toBe(0)
  })

  it('stops a run that is still alive at maxWave and calls it survived', () => {
    const r = simulateSurvivalRun({ state: survivalTestState(), seeds: 5, maxWave: 50 })
    expect(r.deathWave.median).toBe(50)
    expect(r.endedBy.survived).toBe(1)
  })

  it('echoes the assumptions it ran with', () => {
    const r = simulateSurvivalRun({ state: survivalTestState(), seeds: 3, assumptions: { lifestealActive: false } })
    expect(r.assumptions.lifestealActive).toBe(false)
    expect(r.assumptions.maxHealthGrowthHealsCurrent).toBe(true)
  })
})

describe('invariant 1: a better upgrade never lowers the median death wave', () => {
  const raises: [SurvivalStat, number][] = [
    ['Health', 600],
    ['Recovery Amount', 200],
    ['Max Recovery', 300],
    ['Package Chance', 60],
    ['Lifesteal', 80],
    ['Defense Percent', 99],
  ]
  for (const lifestealActive of [true, false]) {
    const base = simulateSurvivalRun({ state: survivalTestState(), seeds: SEEDS, assumptions: { lifestealActive } })
    for (const [stat, level] of raises) {
      it(`${stat} to ${level}, lifesteal ${lifestealActive ? 'on' : 'off'}`, () => {
        const raised = simulateSurvivalRun({
          state: survivalTestState({}, { [stat]: level }),
          seeds: SEEDS,
          assumptions: { lifestealActive },
        })
        expect(raised.deathWave.median).toBeGreaterThanOrEqual(base.deathWave.median)
      })
    }
  }

  it('Health and Max Recovery move it a long way, so the test above is not vacuous', () => {
    const base = simulateSurvivalRun({ state: survivalTestState(), seeds: SEEDS })
    const health = simulateSurvivalRun({ state: survivalTestState({}, { Health: 600 }), seeds: SEEDS })
    expect(health.deathWave.median).toBeGreaterThan(base.deathWave.median + 100)
  })
})

describe('invariant 2: no heal exceeds its cap', () => {
  it('holds on every row of every seeded run', () => {
    const state = survivalTestState()
    for (let i = 0; i < 12; i += 1) {
      const run = simulateSurvivalRunOnce({ state, rows: true }, survivalRunSeed(3, i))
      let previous = run.startingHealth
      for (const row of run.rows ?? []) {
        /* Max Recovery only rises in a run, so the row's own cap bounds the whole wave. */
        const cap = row.maxHealth * 16.5
        expect(row.health).toBeLessThanOrEqual(cap + 1e-6)
        /* Lifesteal and regen only top up to full: they cannot exceed the wave's own damage plus the gap to full. */
        expect(row.lifestealHeal + row.regenHeal).toBeLessThanOrEqual(row.damageTaken + Math.max(0, row.maxHealth - previous) + 1e-6)
        previous = row.health
      }
    }
  })

  it('keeps health under Max Recovery x max health with the upgrade frozen', () => {
    /* No free utility upgrades, so Max Recovery stays at its workshop level for the whole run. */
    const state = survivalTestState({ freeUpgrades: { defenseChance: 0.5, utilityChance: 0, otherDefenseTargets: 1, otherUtilityTargets: 0 } })
    const multiple = resolveSurvivalStats(state).maxRecovery
    const run = simulateSurvivalRunOnce({ state, rows: true }, 11)
    for (const row of run.rows ?? []) expect(row.health).toBeLessThanOrEqual(row.maxHealth * multiple + 1e-6)
    expect(Math.max(...(run.rows ?? []).map(row => row.health / row.maxHealth))).toBeGreaterThan(1.5)
  })
})

describe('invariant 3: with zero packages, Recovery Amount changes nothing', () => {
  it('gives identical runs', () => {
    /*
     * Free utility upgrades are off: Recovery Amount shares them with the level skips, so its
     * level would otherwise change where they land — a real effect, but not this invariant.
     */
    const noPackages = {
      packageAfterBoss: false,
      bonuses: { ...survivalTestState().bonuses, packageChanceAdd: -1 },
      freeUpgrades: { defenseChance: 0.5, utilityChance: 0, otherDefenseTargets: 1, otherUtilityTargets: 0 },
    }
    const low = simulateSurvivalRunOutcomes({ state: survivalTestState(noPackages, { 'Recovery Amount': 0 }), seeds: 20 })
    const high = simulateSurvivalRunOutcomes({ state: survivalTestState(noPackages, { 'Recovery Amount': 300 }), seeds: 20 })
    expect(low.every(o => o.packages === 0)).toBe(true)
    expect(high).toEqual(low)
  })
})

describe('invariant 5: damage taken is accounted for by health that existed', () => {
  it('equals starting health plus every heal plus max-health growth, for a run that died', () => {
    const state = survivalTestState({ deathWave: { maxHealthFractionPerWave: 0.01, maxHealthFractionCap: 0.5 } })
    for (const lifestealActive of [true, false]) {
      for (let i = 0; i < 10; i += 1) {
        const run = simulateSurvivalRunOnce({ state, assumptions: { lifestealActive } }, survivalRunSeed(5, i))
        expect(run.endedBy).not.toBe('survived')
        const supplied = run.startingHealth + run.packageHeal + run.lifestealHeal + run.regenHeal + run.maxHealthGrowth
        expect(run.damageTaken / supplied).toBeCloseTo(1, 9)
      }
    }
  })

  it('sums its rows to its totals', () => {
    const run = simulateSurvivalRunOnce({ state: survivalTestState(), rows: true }, 21)
    const sum = (key: 'damageTaken' | 'packageHeal' | 'packages') => (run.rows ?? []).reduce((a, row) => a + row[key], 0)
    expect(sum('damageTaken')).toBeCloseTo(run.damageTaken, 3)
    expect(sum('packageHeal')).toBeCloseTo(run.packageHeal, 3)
    expect(sum('packages')).toBe(run.packages)
  })
})

describe('the run itself', () => {
  it('skips waves, rolls packages and counts level skips at roughly their chances', () => {
    const state = survivalTestState({}, { 'Enemy Attack Level Skip': 200 })
    const run = simulateSurvivalRunOnce({ state, maxWave: 400, assumptions: { lifestealActive: true } }, 9)
    const waves = run.deathWave
    expect(run.wavesSkipped / waves).toBeGreaterThan(0.05)
    expect(run.wavesSkipped / waves).toBeLessThan(0.16)
    /* Level 200 is a 10.05% skip chance, and free upgrades only raise it. */
    expect(run.attackSkips / waves).toBeGreaterThan(0.09)
    expect(run.packages).toBeGreaterThan(0)
  })

  it('lets active mode follow a declared level schedule and outlive AFK', () => {
    const state = survivalTestState()
    const afk = simulateSurvivalRun({ state, seeds: 30 })
    const active = simulateSurvivalRun({
      state,
      seeds: 30,
      mode: 'active',
      cashPolicy: { targetLevels: { 'Health': 900, 'Enemy Attack Level Skip': 300 }, byWave: 300 },
    })
    expect(active.deathWave.median).toBeGreaterThan(afk.deathWave.median)
    /* The policy is ignored outside active mode. */
    const ignored = simulateSurvivalRun({ state, seeds: 30, cashPolicy: { targetLevels: { Health: 900 }, byWave: 300 } })
    expect(ignored.deathWave).toEqual(afk.deathWave)
  })

  it('does not raise current health with max health when that assumption is off', () => {
    const state = survivalTestState({ deathWave: { maxHealthFractionPerWave: 0.05, maxHealthFractionCap: 2 } })
    const heals = simulateSurvivalRunOnce({ state, maxWave: 30 }, 4)
    const holds = simulateSurvivalRunOnce({ state, maxWave: 30, assumptions: { maxHealthGrowthHealsCurrent: false } }, 4)
    expect(heals.maxHealthGrowth).toBeGreaterThan(0)
    expect(holds.maxHealthGrowth).toBe(0)
  })
})

describe('survivalPercentiles', () => {
  it('reads nearest-rank percentiles', () => {
    expect(survivalPercentiles([5, 1, 3, 2, 4, 6, 7, 8, 9, 10, 11])).toEqual({ p10: 2, median: 6, p90: 10 })
    expect(survivalPercentiles([])).toEqual({ p10: 0, median: 0, p90: 0 })
  })
})

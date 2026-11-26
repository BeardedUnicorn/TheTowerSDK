/**
 * Piece 2 of the wave survival model: damage reaching the tower, by class. The fitted term is the
 * hit curve; these pin everything around it and the directions the curve must move in.
 */
import { describe, expect, it } from 'vitest'
import { getBasicEnemyWaveStats } from '../../../src/mechanics/enemies/wave-stats'
import {
  incomingDamageForWave,
  resolveSurvivalStats,
  SURVIVAL_DEFAULT_CALIBRATION,
  survivalDamageAfterMitigation,
  survivalHitsPerEnemy,
  survivalMeleeHeatUpFactor,
  survivalRatioAtWave,
  survivalSpawnCountsForWave,
} from '../../../src/mechanics/survival'
import type { SurvivalCalibration } from '../../../src/mechanics/survival'
import { survivalTestState } from '../../helpers/survival-state'

const state = survivalTestState()
const anchored: SurvivalCalibration = { ...SURVIVAL_DEFAULT_CALIBRATION, referenceRatio: survivalRatioAtWave(state, 1000) }

describe('spawn counts', () => {
  it('spawn a boss on the tier boss interval and nowhere else', () => {
    expect(survivalSpawnCountsForWave(state, 200).boss).toBe(1)
    expect(survivalSpawnCountsForWave(state, 201).boss).toBe(0)
  })

  it('split ordinary enemies by the state shares', () => {
    const counts = survivalSpawnCountsForWave(state, 300)
    const ordinary = counts.basic + counts.fast + counts.tank + counts.ranged + counts.protector
    expect(counts.fast / ordinary).toBeCloseTo(0.14, 10)
    expect(counts.ranged / ordinary).toBeCloseTo(0.11, 10)
  })

  it('scale with the measured count scale', () => {
    const doubled = survivalTestState({ spawn: { ...state.spawn, countScale: 2 } })
    expect(survivalSpawnCountsForWave(doubled, 300).basic).toBeCloseTo(2 * survivalSpawnCountsForWave(state, 300).basic, 8)
  })
})

describe('mitigation', () => {
  const stats = resolveSurvivalStats(state)

  it('takes Defense % first and Defense Absolute after', () => {
    expect(stats.defensePercent).toBeCloseTo(0.3, 10)
    expect(survivalDamageAfterMitigation(10_000, stats)).toBeCloseTo(10_000 * 0.7 - stats.defenseAbsolute, 6)
  })

  it('never goes below zero', () => {
    expect(survivalDamageAfterMitigation(1, stats)).toBe(0)
  })

  it('caps Defense % at 98%', () => {
    const maxed = resolveSurvivalStats(survivalTestState({ bonuses: { ...state.bonuses, defensePercentAdd: 5 } }))
    expect(maxed.defensePercent).toBe(0.98)
  })
})

describe('hit curves', () => {
  it('read exp(logHits) at the reference ratio', () => {
    expect(survivalHitsPerEnemy({ logHits: Math.log(0.25), exponent: 0.7 }, 40, 40)).toBeCloseTo(0.25, 12)
  })

  it('rise as enemies outlive the tower', () => {
    const curve = { logHits: Math.log(0.25), exponent: 0.5 }
    expect(survivalHitsPerEnemy(curve, 160, 40)).toBeCloseTo(0.5, 12)
    expect(survivalHitsPerEnemy(curve, 10, 40)).toBeCloseTo(0.125, 12)
  })

  it('heat up 4% a hit for melee', () => {
    expect(survivalMeleeHeatUpFactor(1)).toBe(1)
    expect(survivalMeleeHeatUpFactor(2)).toBeCloseTo((1 + 1.04) / 2, 12)
    expect(survivalMeleeHeatUpFactor(3)).toBeCloseTo((1 + 1.04 + 1.04 ** 2) / 3, 12)
  })
})

describe('incomingDamageForWave', () => {
  it('sums its classes to the total', () => {
    const d = incomingDamageForWave(state, 500, anchored)
    const sum = Object.values(d.byClass).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(d.total, 4)
    expect(d.total).toBeGreaterThan(0)
    expect(d.mitigated).toBeGreaterThan(0)
  })

  it('has boss damage only on boss waves', () => {
    expect(incomingDamageForWave(state, 500, anchored).byClass.boss).toBeGreaterThan(0)
    expect(incomingDamageForWave(state, 501, anchored).byClass.boss).toBe(0)
  })

  it('falls when Defense % rises', () => {
    const tougher = survivalTestState({}, { 'Defense Percent': 99 })
    expect(incomingDamageForWave(tougher, 501, anchored).total).toBeLessThan(incomingDamageForWave(state, 501, anchored).total)
  })

  it('reads enemy damage at the wave less the attack level skips', () => {
    const skipped = incomingDamageForWave(state, 501, anchored, { attackSkips: 100 })
    const earlier = getBasicEnemyWaveStats(3, 401, false).damage / getBasicEnemyWaveStats(3, 501, false).damage
    expect(skipped.total).toBeLessThan(incomingDamageForWave(state, 501, anchored).total)
    /* Flat defense makes the fall slightly steeper than the raw ratio, never shallower. */
    expect(skipped.total / incomingDamageForWave(state, 501, anchored).total).toBeLessThanOrEqual(earlier + 1e-9)
  })

  it('falls when the tower kills faster, once the curve is anchored', () => {
    const stronger = survivalTestState({ effectiveDamage: 4000 })
    expect(incomingDamageForWave(stronger, 501, anchored).total).toBeLessThan(incomingDamageForWave(state, 501, anchored).total)
  })

  it('is blind to kill speed with the unanchored default, and says so in the calibration', () => {
    const stronger = survivalTestState({ effectiveDamage: 4000 })
    expect(SURVIVAL_DEFAULT_CALIBRATION.referenceRatio).toBeNull()
    expect(incomingDamageForWave(stronger, 501).total).toBeCloseTo(incomingDamageForWave(state, 501).total, 4)
  })
})

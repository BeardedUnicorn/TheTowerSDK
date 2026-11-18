import { describe, expect, it } from 'vitest'
import {
  CHAIN_THUNDER_ACCUMULATED_HP_SCALE,
  SMITE_DAMAGE_BY_CL_PLUS_LEVEL,
} from '../../src/mechanics/combat/damage-redux-constants'
import {
  computeChainLightningPlusHitDamage,
  computeChainThunderMaxReductionPct,
  computeChainThunderReductionFraction,
  computeChainThunderReductionPct,
  computeChronoFieldReductionPct,
  computeFlameBotDamageTakenMultiplier,
  computeFlameBotEffectiveReductionPct,
  computeNmpTotalReductionPct,
  computeSmiteDamageFraction,
} from '../../src/mechanics/combat/damage-redux-layers'

describe('damage-redux-layers', () => {
  it('SmiteDamage table matches its reference values', () => {
    expect(SMITE_DAMAGE_BY_CL_PLUS_LEVEL[0]).toBe(0.0005)
    expect(SMITE_DAMAGE_BY_CL_PLUS_LEVEL[11]).toBe(0.006)
    expect(computeSmiteDamageFraction(11)).toBe(0.006)
  })

  it('chrono lab 55 scales 10% + 0.5% per level when lab 54 unlocked', () => {
    expect(computeChronoFieldReductionPct(0, true)).toBe(0)
    expect(computeChronoFieldReductionPct(1, true)).toBe(10.5)
    expect(computeChronoFieldReductionPct(30, true)).toBe(25)
    expect(computeChronoFieldReductionPct(30, false)).toBe(0)
  })

  it('chain thunder uses accumulated CL damage / enemyHealthMax × 10/6', () => {
    const basicWaveHp = 1_000_000
    const enemyHealthMax = 1_000_000
    const totalCl = computeChainLightningPlusHitDamage(11, basicWaveHp, 10)
    expect(totalCl).toBeCloseTo(60_000, 4)
    const fraction = computeChainThunderReductionFraction({
      ctLevel: 30,
      enemyHealthMax,
      basicWaveHp,
      clPlusLevel: 11,
      avgClPlusHits: 10,
    })
    expect(fraction).toBeCloseTo(0.1, 4)
    expect(fraction * CHAIN_THUNDER_ACCUMULATED_HP_SCALE).toBeGreaterThan(0)
    expect(computeChainThunderReductionPct({
      ctLevel: 30,
      enemyHealthMax,
      basicWaveHp,
      clPlusLevel: 11,
      avgClPlusHits: 10,
    })).toBeCloseTo(10, 4)
  })

  it('chain thunder caps at lab level × 3% fraction', () => {
    expect(computeChainThunderMaxReductionPct(30)).toBeCloseTo(90, 8)
    expect(computeChainThunderReductionFraction({
      ctLevel: 30,
      enemyHealthMax: 1,
      basicWaveHp: 1_000_000,
      clPlusLevel: 11,
      avgClPlusHits: 100,
      assumeMaxReduction: true,
    })).toBeCloseTo(0.9, 8)
  })

  it('chain thunder ratio uses enemy max HP (tank 5× lowers CT fraction)', () => {
    const basicWaveHp = 1_000_000
    const baseInput = {
      ctLevel: 30,
      basicWaveHp,
      clPlusLevel: 11,
      avgClPlusHits: 10,
    }
    const basicFraction = computeChainThunderReductionFraction({
      ...baseInput,
      enemyHealthMax: basicWaveHp,
    })
    const tankFraction = computeChainThunderReductionFraction({
      ...baseInput,
      enemyHealthMax: basicWaveHp * 5,
    })
    expect(tankFraction).toBeCloseTo(basicFraction / 5, 4)
  })

  it('NMP stacks linearly with 50% cap', () => {
    expect(computeNmpTotalReductionPct(10, 2.5)).toBe(25)
    expect(computeNmpTotalReductionPct(30, 2.5)).toBe(50)
  })

  it('flame bot Bot Bot bonus uses pow stacking', () => {
    const base = computeFlameBotEffectiveReductionPct({ reductionPct: 50 })
    const boosted = computeFlameBotEffectiveReductionPct({ reductionPct: 50, botBotBonusMultiplier: 2 })
    expect(boosted).toBeGreaterThan(base)
    expect(computeFlameBotDamageTakenMultiplier({ reductionPct: 95, botBotBonusMultiplier: 2 }))
      .toBeLessThan(0.05)
  })
})

describe('Smite caps at 100 hits per enemy', () => {
  /*
   * v29.2 patch note 1571908570797318216: "CL+ (Smite) now appropriately caps at 100". Wiki
   * "Chain Lightning/Ultimate Weapon Plus": activates up to 100 times per enemy.
   */
  it('counts no more than 100 hits of damage', async () => {
    const { computeChainLightningPlusHitDamage, SMITE_MAX_HITS_PER_ENEMY } = await import('../../src/mechanics/combat/damage-redux-layers')
    expect(SMITE_MAX_HITS_PER_ENEMY).toBe(100)
    expect(computeChainLightningPlusHitDamage(11, 1000, 150)).toBeCloseTo(computeChainLightningPlusHitDamage(11, 1000, 100))
    expect(computeChainLightningPlusHitDamage(11, 1000, 100)).toBeCloseTo(0.006 * 1000 * 100)
  })

  it('feeds Chain Thunder no more than 100 hits either', async () => {
    const { computeChainThunderReductionFraction } = await import('../../src/mechanics/combat/damage-redux-layers')
    const base = { ctLevel: 30, enemyHealthMax: 1e9, basicWaveHp: 1e6, clPlusLevel: 11 }
    expect(computeChainThunderReductionFraction({ ...base, avgClPlusHits: 500 }))
      .toBe(computeChainThunderReductionFraction({ ...base, avgClPlusHits: 100 }))
  })
})

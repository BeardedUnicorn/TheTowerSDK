import { describe, expect, it } from 'vitest'
import { WORKSHOP_DATA } from '../../src/data/workshop/table'
import { computeWorkshopEnhancementMaxLevel } from '../../src/data/workshop/compute'
import { getWorkshopCostByKeyAndLevel, getWorkshopMaxLevelByKey } from '../../src/data/workshop/costs'
import { getOutOfRoundDamagePreview, workshopDamageCurve } from '../../src/mechanics/workshop/attack-stats'
import { workshopDamageAtLevel } from '../../src/mechanics/workshop/damage'
import {
  getOutOfRoundHealthRegenPreview,
  healthRegenCurve,
  healthRegenTier249,
  healthRegenTier499,
  healthRegenTier5k,
} from '../../src/mechanics/workshop/defense-stats'

/**
 * The workshop's closed-form curves against every row of the game's table.
 *
 * `WORKSHOP_DATA` is what the game's own workshop file states, so a formula for an upgrade is
 * right when it gives every row, and these check all 6001 of them rather than a level or two.
 * Two curves did not: `workshopDamageCurve` carried a quadratic coefficient of 1e-6 where the game
 * loads 0.077, and `healthRegenCurve` was missing two of the game's terms. Each gave a number of a
 * believable size and was out by up to 97% and 99.5%.
 */
const rows = (stat: string): number[] => {
  const table = (WORKSHOP_DATA as unknown as Record<string, Record<string, { value: number }>>)[stat]
  return Object.keys(table).map(Number).sort((a, b) => a - b).map(level => table[String(level)].value)
}

/** The largest relative error of a formula over a whole upgrade, and the level it happens at. */
const worst = (stat: string, formula: (level: number) => number): { error: number, level: number } => {
  let found = { error: 0, level: 0 }
  rows(stat).forEach((value, level) => {
    const error = Math.abs(formula(level) / value - 1)
    if (error > found.error) found = { error, level }
  })
  return found
}

describe('workshop damage', () => {
  it('has all 6001 rows to check against', () => {
    expect(rows('Damage')).toHaveLength(6001)
    expect(rows('Health Regen')).toHaveLength(6001)
  })

  it('workshopDamageCurve gives every row of the table', () => {
    // 4.15e-7 is the table's own float rounding, and what `workshopDamageAtLevel` reaches too.
    expect(worst('Damage', workshopDamageCurve).error).toBeLessThan(1e-6)
  })

  it('gives the damage the Workshop was showing before labs and relics', () => {
    // Level 805 on the checked account: 52,154.925 in the table.
    expect(workshopDamageCurve(805)).toBeCloseTo(52154.925, 2)
    expect(workshopDamageCurve(100)).toBeCloseTo(1053, 6) // 3 + 2.8 x 100 + 0.077 x 100^2
    expect(getOutOfRoundDamagePreview({ workshopLevel: 805, catalogMult: 1 })).toBeCloseTo(52154.925, 2)
  })

  it('is the same curve as workshopDamageAtLevel, which had it right', () => {
    for (const level of [0, 1, 999, 1000, 2999, 3000, 3500, 4000, 6000, 7500]) {
      expect(workshopDamageCurve(level)).toBeCloseTo(workshopDamageAtLevel(level), 6)
    }
  })

  it('weights the band past level 2999 at 0.15, where it had 0.10', () => {
    // The two differ by nothing below the band and by 7% at the top of the table.
    const band = workshopDamageCurve(6000) - workshopDamageCurve(2999)
    expect(band).toBeGreaterThan(0)
    expect(worst('Damage', level => (level > 2999 ? workshopDamageCurve(level) : rows('Damage')[level])).error).toBeLessThan(1e-6)
  })
})

describe('workshop health regen', () => {
  const regen = (level: number): number => healthRegenCurve(level) * healthRegenTier5k(level)

  it('healthRegenCurve with the past-5000 factor gives every row of the table', () => {
    expect(worst('Health Regen', regen).error).toBeLessThan(2e-6)
  })

  it('starts at the table\'s level 0 and level 1', () => {
    expect(regen(0)).toBeCloseTo(0.0005, 9)
    expect(regen(1)).toBeCloseTo(0.04, 7)
    expect(regen(100)).toBeCloseTo(269.1124, 3)
  })

  it('adds a term from level 250 and another from level 500', () => {
    expect(healthRegenTier249(249)).toBe(0)
    expect(healthRegenTier249(250)).toBe(1) // (250 - 249) ^ 2.25
    expect(healthRegenTier499(499)).toBe(0)
    expect(healthRegenTier499(500)).toBe(1) // (500 - 499) ^ 2.85
    expect(healthRegenTier499(501)).toBeCloseTo(2 ** 2.85, 9)
  })

  it('grows by 0.24% a level past 5000, on the whole value', () => {
    expect(healthRegenTier5k(5000)).toBe(1)
    expect(healthRegenTier5k(5001)).toBeCloseTo(1.0024, 6)
    expect(healthRegenTier5k(6000)).toBeCloseTo(1.0024 ** 1000, 2)
    // The table's own step from 5000 to 5001 is 0.30%: 0.24% from this and the rest from the curve.
    expect(rows('Health Regen')[5001] / rows('Health Regen')[5000]).toBeCloseTo(1.003033, 5)
  })

  it('the Workshop preview is that value times its multipliers', () => {
    expect(getOutOfRoundHealthRegenPreview({ workshopLevel: 754, catalogMult: 1 })).toBeCloseTo(rows('Health Regen')[754], 0)
    expect(getOutOfRoundHealthRegenPreview({ workshopLevel: 5500, catalogMult: 1 }) / rows('Health Regen')[5500]).toBeCloseTo(1, 5)
    expect(getOutOfRoundHealthRegenPreview({ workshopLevel: 100, catalogMult: 2, cardMult: 1.5 }))
      .toBeCloseTo(regen(100) * 3, 6)
  })
})

describe('the last row of an enhancement ladder', () => {
  it('getWorkshopMaxLevelByKey is the last priced row, one below the number of levels', () => {
    // A ladder's row L buys level L + 1, so 600 levels are priced on rows 0 to 599.
    expect(getWorkshopMaxLevelByKey('WSP_DAMAGE')).toBe(599)
    expect(computeWorkshopEnhancementMaxLevel('WSP_DAMAGE')).toBe(600)
    expect(getWorkshopCostByKeyAndLevel('WSP_DAMAGE', 599)).toBeGreaterThan(0)
    expect(getWorkshopCostByKeyAndLevel('WSP_DAMAGE', 600)).toBeNull()
    expect(getWorkshopMaxLevelByKey('Nonsense')).toBeNull()
  })
})

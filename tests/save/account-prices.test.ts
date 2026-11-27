import { describe, expect, it } from 'vitest'
import { computeWorkshopUpgradePrice } from '../../src/data/workshop/upgrade-price'
import { compareCoinBonusScenarios } from '../../src/mechanics/coin-bonus'
import type { TotalCoinBonusInput } from '../../src/mechanics/coin-bonus'
import { labSpeedTotal } from '../../src/mechanics/effective-paths/lab-costs'
import {
  labCostModifiersFromLevels,
  labSpeedRelicFractionFromIndices,
  priceEnhancementLevelsForAccount,
  priceWorkshopLevelsForAccount,
  snapshotUnlockedRelicIndices,
  toExportSnapshot,
  workshopTabOfStat,
} from '../../src/save'
import { PLANNING_SAVE } from '../helpers/planning-fixture'

/*
 * The Workshop screen of the example account on build 1301, Workshop Utility Discount 30 (15%)
 * and Workshop Defense Discount 30: Recovery Amount 35 → 100 was 3.36B against a 3.95B list
 * price, taking the stat from 28% to 54%; Max Recovery 45 → 100 was 3.31B; Health 1300 → 1500 7.95B.
 */
describe('workshop prices at an account\'s discount', () => {
  const labLevels = { workshop_utility_discount: 30, workshop_defense_discount: 30, workshop_attack_discount: 32 }

  it('reads the discount lab of the stat\'s own tab', () => {
    expect(workshopTabOfStat('Recovery Amount')).toBe('utility')
    expect(workshopTabOfStat('Health')).toBe('defense')
    expect(workshopTabOfStat('Damage')).toBe('attack')
    expect(workshopTabOfStat('Nope')).toBeNull()
    expect(priceWorkshopLevelsForAccount({ stat: 'Damage', fromLevel: 805, toLevel: 806, labLevels })?.discountPct).toBe(16)
  })

  it('gives the price the screen shows, with the stat before and after', () => {
    const recovery = priceWorkshopLevelsForAccount({ stat: 'Recovery Amount', fromLevel: 35, toLevel: 100, labLevels })
    expect(recovery).toMatchObject({ coins: 3_360_252_115, discountPct: 15, valueBefore: 0.28, valueAfter: 0.54 })
    expect(recovery?.listCoins).toBeCloseTo(3.953e9, -7)
    expect(priceWorkshopLevelsForAccount({ stat: 'Max Recovery', fromLevel: 45, toLevel: 100, labLevels })?.coins).toBeCloseTo(3.31e9, -7)
    expect(priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 1300, toLevel: 1500, labLevels })?.coins).toBeCloseTo(7.95e9, -7)
  })

  it('prices a long range level by level in one call', () => {
    const long = priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 1300, toLevel: 2082, labLevels })!
    let byHundreds = 0
    for (let level = 1300; level < 2082; level += 100) {
      byHundreds += computeWorkshopUpgradePrice('Health', level, Math.min(100, 2082 - level), 15)!.coins
    }
    expect(long.coins).toBe(byHundreds)
    // Rounding each level is not the same as discounting the total.
    expect(long.coins).not.toBe(Math.round(long.listCoins * 0.85))
    expect(Math.abs(long.coins / (long.listCoins * 0.85) - 1)).toBeLessThan(1e-6)
  })

  it('returns null where there is nothing to price', () => {
    expect(priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 10, toLevel: 5, labLevels })).toBeNull()
    expect(priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 1.5, toLevel: 5, labLevels })).toBeNull()
    expect(priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 0, toLevel: 1e6, labLevels })).toBeNull()
    expect(priceWorkshopLevelsForAccount({ stat: 'Health', fromLevel: 7, toLevel: 7, labLevels })?.coins).toBe(0)
  })
})

describe('enhancement prices', () => {
  it('uses the enhancement discount labs, not the workshop ones', () => {
    const list = priceEnhancementLevelsForAccount({ stat: 'Coin Bonus', fromLevel: 0, toLevel: 1, labLevels: { workshop_utility_discount: 30 } })
    expect(list).toMatchObject({ coins: 5e9, listCoins: 5e9, discountPct: 0 })
    const discounted = priceEnhancementLevelsForAccount({ stat: 'Coin Bonus', fromLevel: 0, toLevel: 1, labLevels: { enhancement_utility_coin_discount: 10 }, vaultDiscountPct: 10 })
    expect(discounted?.coins).toBeCloseTo(5e9 * 0.97 * 0.9, 0)
    expect(discounted?.discountPct).toBeCloseTo(12.7, 9)
    expect(priceEnhancementLevelsForAccount({ stat: 'Nope', fromLevel: 0, toLevel: 1, labLevels: {} })).toBeNull()
  })
})

/* The example account's Labs screen: Labs Speed 54 and a 3.5% relic gave 2.153x before any boost. */
describe('lab cost modifiers', () => {
  it('reproduces the account\'s lab speed from its lab level and relics', () => {
    const relics = labSpeedRelicFractionFromIndices(snapshotUnlockedRelicIndices(toExportSnapshot(PLANNING_SAVE)!))
    expect(relics).toBeCloseTo(0.035, 9)
    const modifiers = labCostModifiersFromLevels({ labs_speed: 54, labs_coin_discount: 43 }, relics)
    expect(modifiers).toEqual({ coinDiscountLabLevel: 43, labSpeedLabLevel: 54, labSpeedRelicPct: relics })
    expect(labSpeedTotal(modifiers.labSpeedLabLevel, modifiers.labSpeedRelicPct)).toBeCloseTo(2.1528, 4)
    expect(labSpeedRelicFractionFromIndices([])).toBe(0)
  })
})

describe('coin bonus scenarios', () => {
  const base = (PLANNING_SAVE as { readers: { readTotalCoinBonusFromSaveRoot: { input: TotalCoinBonusInput } } }).readers.readTotalCoinBonusFromSaveRoot.input

  it('returns the three Dissonance what-ifs in one call', () => {
    const rows = compareCoinBonusScenarios(base, [1800, 2000, 2200].map(wave => ({ name: `wave ${wave}`, dissonanceWave: { tier: 7, wave } })))
    expect(rows.map(row => ((row.ratioToNow! - 1) * 100).toFixed(1))).toEqual(['3.2', '8.5', '14.1'])
    expect(rows.map(row => row.total!.toFixed(1))).toEqual(['190.5', '200.1', '210.5'])
    expect(rows[1].changedRows.map(row => row.row)).toEqual(['dissonance'])
  })

  it('keeps a tier\'s best wave, merges one level deep, and compares at the scenario\'s own tier', () => {
    const [lower, unequipped, tierSix] = compareCoinBonusScenarios(base, [
      { name: 'lower', dissonanceWave: { tier: 7, wave: 1000 } },
      { name: 'no card', overrides: { coinsCard: { equipped: false } } },
      { name: 'tier 6', tier: 6 },
    ])
    expect(lower).toMatchObject({ ratioToNow: 1, changedRows: [] })
    expect(unequipped.ratioToNow).toBeCloseTo(1 / 1.45, 9)
    expect(unequipped.changedRows).toEqual([{ row: 'activeCards', from: 1.45, to: 1 }])
    expect(tierSix).toMatchObject({ tier: 6, ratioToNow: 1 })
  })

  it('answers the rest when one scenario cannot be priced', () => {
    const rows = compareCoinBonusScenarios(base, [{ name: 'bad', overrides: { nope: 1 } }, { name: 'bad field', overrides: { coinsCard: { nope: 1 } } }, { name: 'good', overrides: { relicCoinBonus: 0.2 } }])
    expect(rows[0]).toMatchObject({ total: null, ratioToNow: null })
    expect(rows[0].error).toMatch(/no field "nope"/)
    expect(rows[1].error).toMatch(/"coinsCard" has no field "nope"/)
    expect(rows[2].ratioToNow).toBeCloseTo(1.2 / 1.14, 9)
  })
})

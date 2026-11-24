import { describe, expect, it } from 'vitest'

import { uwPlusUnlockCostsByOwnedCount, uwPlusUnlockTotal } from '../../src/charts'
import {
  getNextUltimateWeaponPlusStoneCost,
  getNextUltimateWeaponStoneCost,
  ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED,
  UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED,
  uwStoneChartData,
} from '../../src/data'
import {
  ULTIMATE_WEAPON_STONE_COST,
  ULTIMATE_WEAPON_TOTAL_STONE_COST,
  UW_PLUS_ABILITIES,
  UW_PLUS_UNLOCK_STONE_COST,
  UW_PLUS_UNLOCK_TOTAL_STONES,
} from '../../src/knowledge'
import { UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED as MECHANICS_UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED, uwPlusUnlockStoneCost } from '../../src/mechanics'

describe('the ultimate weapon unlock ladder', () => {
  it('has one rung per weapon in the catalog', () => {
    expect(ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED).toHaveLength(Object.keys(uwStoneChartData).length)
  })

  it('sums to the total the wiki states', () => {
    expect(ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED.reduce((sum, n) => sum + n, 0)).toBe(ULTIMATE_WEAPON_TOTAL_STONE_COST)
  })

  it('is the same array through the knowledge entry point, under its released name', () => {
    expect(ULTIMATE_WEAPON_STONE_COST).toBe(ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED)
  })
})

describe('getNextUltimateWeaponStoneCost', () => {
  it('prices the next weapon by how many are owned', () => {
    expect(getNextUltimateWeaponStoneCost(0)).toBe(5)
    expect(getNextUltimateWeaponStoneCost(6)).toBe(1750)
    expect(getNextUltimateWeaponStoneCost(8)).toBe(3000)
  })

  it('has nothing to sell once all nine are owned', () => {
    expect(getNextUltimateWeaponStoneCost(9)).toBeNull()
  })

  it('refuses a count that cannot be one', () => {
    expect(getNextUltimateWeaponStoneCost(-1)).toBeNull()
    expect(getNextUltimateWeaponStoneCost(2.5)).toBeNull()
    expect(getNextUltimateWeaponStoneCost(Number.NaN)).toBeNull()
  })
})

describe('the ultimate weapon plus unlock ladder', () => {
  it('is the wiki\'s Unlocking table, one rung per plus', () => {
    expect(UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED).toEqual([500, 625, 750, 975, 1250, 1650, 2200, 2900, 3800])
    expect(UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED).toHaveLength(Object.keys(UW_PLUS_ABILITIES).length)
  })

  it('sums to the total knowledge states and the chart prints', () => {
    const total = UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED.reduce((sum, n) => sum + n, 0)
    expect(total).toBe(UW_PLUS_UNLOCK_TOTAL_STONES)
    expect(String(total)).toBe(uwPlusUnlockTotal)
  })

  /*
   * The ladder used to be typed out three times. These hold it to one: knowledge and mechanics
   * hand out the data array itself, so a changed rung cannot reach one entry point and miss
   * another.
   */
  it('is the same array through knowledge, under its released name', () => {
    expect(UW_PLUS_UNLOCK_STONE_COST).toBe(UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED)
  })

  it('is the same array through mechanics, under the same name', () => {
    expect(MECHANICS_UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED).toBe(UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED)
  })

  it('is what the chart prints, rung for rung, with -/- once all nine are owned', () => {
    expect(uwPlusUnlockCostsByOwnedCount).toEqual({
      ...Object.fromEntries(UW_PLUS_UNLOCK_STONE_COSTS_BY_OWNED.map((stones, owned) => [String(owned), String(stones)])),
      9: '-/-',
    })
    expect(uwPlusUnlockCostsByOwnedCount).toEqual({
      0: '500', 1: '625', 2: '750', 3: '975', 4: '1250', 5: '1650', 6: '2200', 7: '2900', 8: '3800', 9: '-/-',
    })
  })
})

describe('getNextUltimateWeaponPlusStoneCost', () => {
  it('prices the next plus by how many are owned', () => {
    expect(getNextUltimateWeaponPlusStoneCost(0)).toBe(500)
    expect(getNextUltimateWeaponPlusStoneCost(3)).toBe(975)
    expect(getNextUltimateWeaponPlusStoneCost(8)).toBe(3800)
  })

  it('has nothing to sell once all nine are owned', () => {
    expect(getNextUltimateWeaponPlusStoneCost(9)).toBeNull()
  })

  it('refuses a count that cannot be one', () => {
    expect(getNextUltimateWeaponPlusStoneCost(-1)).toBeNull()
    expect(getNextUltimateWeaponPlusStoneCost(2.5)).toBeNull()
    expect(getNextUltimateWeaponPlusStoneCost(Number.NaN)).toBeNull()
  })

  it('answers exactly as the mechanics calculator does, for every count', () => {
    for (const owned of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 2.5]) {
      expect(uwPlusUnlockStoneCost(owned), `owned ${owned}`).toBe(getNextUltimateWeaponPlusStoneCost(owned))
    }
  })
})

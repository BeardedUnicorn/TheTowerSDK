import { describe, expect, it } from 'vitest'

import { getNextUltimateWeaponStoneCost, ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED, uwStoneChartData } from '../../src/data'
import { ULTIMATE_WEAPON_STONE_COST, ULTIMATE_WEAPON_TOTAL_STONE_COST } from '../../src/knowledge'

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

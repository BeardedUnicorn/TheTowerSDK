import { describe, expect, it } from 'vitest'
import {
  ASSIST_MODULE_MULTIPLIER_STONE_COSTS,
  ASSIST_MODULE_STONE_COSTS,
  ASSIST_MODULE_SUBSTAT_STONE_COSTS,
  MODULE_INVENTORY_CAP,
} from '../../src/data/modules'
import { assistEfficiencyStoneCost, maxStoneLevel } from '../../src/mechanics/effective-paths/assist-efficiency'

/*
 * Wiki "Modules" § Assist Modules: 1% is free at unlock; 2% costs 15 stones and each later level 3
 * more. The Multiplier track runs to 100% (16,038 stones), the Substat track to 70% (8,073). Game
 * data v29.2.0 caps the two at 99 and 69 levels. The SDK used one 69-level ladder for both.
 */
describe('assist module stone ladders', () => {
  it('prices the Multiplier track to 100%', () => {
    expect(ASSIST_MODULE_MULTIPLIER_STONE_COSTS).toHaveLength(99)
    expect(ASSIST_MODULE_MULTIPLIER_STONE_COSTS[0]).toBe(15)
    expect(ASSIST_MODULE_MULTIPLIER_STONE_COSTS.at(-1)).toBe(309)
    expect(ASSIST_MODULE_MULTIPLIER_STONE_COSTS.reduce((a, b) => a + b, 0)).toBe(16_038)
  })

  it('prices the Substat track to 70%', () => {
    expect(ASSIST_MODULE_SUBSTAT_STONE_COSTS).toHaveLength(69)
    expect(ASSIST_MODULE_SUBSTAT_STONE_COSTS.at(-1)).toBe(219)
    expect(ASSIST_MODULE_SUBSTAT_STONE_COSTS.reduce((a, b) => a + b, 0)).toBe(8_073)
    expect(ASSIST_MODULE_STONE_COSTS).toEqual(ASSIST_MODULE_SUBSTAT_STONE_COSTS)
  })

  it('agrees with the Effective Paths price at every level of both tracks', () => {
    for (const [kind, ladder] of [['multiplier', ASSIST_MODULE_MULTIPLIER_STONE_COSTS], ['substat', ASSIST_MODULE_SUBSTAT_STONE_COSTS]] as const) {
      expect(ladder).toHaveLength(maxStoneLevel(kind))
      ladder.forEach((cost, index) => expect(assistEfficiencyStoneCost(kind, index + 1)).toBe(cost))
      expect(assistEfficiencyStoneCost(kind, ladder.length + 1)).toBeNull()
    }
  })
})

describe('the module inventory', () => {
  it('holds 350 modules since v29.1', () => {
    expect(MODULE_INVENTORY_CAP).toBe(350)
  })
})

import { describe, expect, it } from 'vitest'
import { clampLabRange } from '../../src/data/labs/overview'
import {
  MODULE_COIN_COSTS,
  MODULE_SHARD_COSTS,
  sumModuleCoinCostsBetween,
  sumModuleShardCostsBetween,
} from '../../src/data/modules/costs'
import { MODULE_SUBSTAT_CANONICAL_DATA } from '../../src/data/modules/substats'

/**
 * A request past the end of a table is answered from the end of the table.
 *
 * Asking for a module's cost to level 301, one past the cap, returned 0 -- free -- because the
 * running total was read from beyond the last entry. A lab already at its cap was given a target
 * one level above it. Both are a caller's off-by-one turning into a confident wrong answer.
 */
describe('module cost sums', () => {
  const cap = MODULE_COIN_COSTS.length + 1

  it('prices a range that runs past the cap as the range to the cap', () => {
    const toCap = sumModuleCoinCostsBetween(1, cap, 0)
    expect(toCap).toBeGreaterThan(0)
    expect(sumModuleCoinCostsBetween(1, cap + 1, 0)).toBe(toCap)
    expect(sumModuleCoinCostsBetween(1, cap + 500, 0)).toBe(toCap)
    expect(sumModuleShardCostsBetween(250, MODULE_SHARD_COSTS.length + 6, 0))
      .toBe(sumModuleShardCostsBetween(250, MODULE_SHARD_COSTS.length + 1, 0))
  })

  it('prices nothing for a range that starts at or past the cap', () => {
    expect(sumModuleCoinCostsBetween(cap, cap + 5, 0)).toBe(0)
    expect(sumModuleCoinCostsBetween(cap + 5, cap + 10, 0)).toBe(0)
  })

  it('still sums an ordinary range level by level', () => {
    expect(sumModuleCoinCostsBetween(1, 4, 0))
      .toBe(MODULE_COIN_COSTS[0] + MODULE_COIN_COSTS[1] + MODULE_COIN_COSTS[2])
  })
})

describe('clampLabRange', () => {
  const lab = { levels: [{ level: 1 }, { level: 30 }] } as Parameters<typeof clampLabRange>[0]

  it('never returns a target above the lab cap', () => {
    expect(clampLabRange(lab, 30, 30)).toEqual({ startLevel: 30, targetLevel: 30 })
    expect(clampLabRange(lab, 45, 99)).toEqual({ startLevel: 30, targetLevel: 30 })
  })

  it('keeps the target above the start while there is room', () => {
    expect(clampLabRange(lab, 5, 5)).toEqual({ startLevel: 5, targetLevel: 6 })
    expect(clampLabRange(lab, 5, 20)).toEqual({ startLevel: 5, targetLevel: 20 })
  })
})

describe('module substat rarities', () => {
  const definitions = Object.values(MODULE_SUBSTAT_CANONICAL_DATA).flatMap(category => category.substats)

  it('lists a rarity as available only when it has a value', () => {
    for (const definition of definitions) {
      for (const rarity of definition.availableRarities) {
        expect(definition.valuesByRarity[rarity], `${definition.label} at ${rarity}`).toBeTruthy()
      }
    }
  })

  it('leaves out the rarities a substat is blank at', () => {
    const blank = definitions.filter(definition =>
      Object.values(definition.valuesByRarity).some(value => value === ''))
    expect(blank.length).toBeGreaterThan(0)
    for (const definition of blank) {
      expect(definition.availableRarities.length)
        .toBeLessThan(Object.keys(definition.valuesByRarity).length)
    }
  })
})

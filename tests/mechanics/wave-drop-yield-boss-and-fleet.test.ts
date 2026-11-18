import { describe, expect, it } from 'vitest'
import { computeWaveDropYield } from '../../src/mechanics/resource-drops/wave-drop-yield'
import { getEnemyDropsLabBenefits, getShatterShards } from '../../src/mechanics/enemies/drops-game-data'
import { baseCoinInput } from './resource-drops-coin-simulation.test'

/*
 * Tier 20 spawns a boss every 5 waves and a fleet at wave 5, so wave 5 is both. The fleet's module
 * shards used to be ASSIGNED over the boss's shatter shards, dropping them.
 */
describe('a wave that is both a boss and a fleet wave', () => {
  it('keeps the boss shatter shards and adds the fleet module shards', () => {
    const input = baseCoinInput({ tier: 20, shatterCommonModules: true, shatterRareModules: false })
    const row = computeWaveDropYield(input, 5, 1, 1)
    expect(row.isBossWave).toBe(true)
    expect(row.isFleetWave).toBe(true)

    const labs = getEnemyDropsLabBenefits(input)
    const bossShatter = labs.commonDropChance * getShatterShards('common', labs.shatterBenefit)
    // One fleet at wave 5: 20% chance of 5 shards (wiki "Fleet Enemies" § Module Shards).
    const fleetShards = row.fleetCount * 0.2 * 5
    expect(row.moduleShards).toBeCloseTo(bossShatter + fleetShards, 10)
  })

  it('prices fleet module shards by the wave the fleet spawned on', () => {
    const input = baseCoinInput({ tier: 20, shatterCommonModules: false, shatterRareModules: false })
    // Wave 5005 is a fleet wave on tier 20 (every 10 waves from 5): 25 shards per fleet.
    const late = computeWaveDropYield(input, 5005, 1, 1)
    expect(late.isFleetWave).toBe(true)
    expect(late.moduleShards).toBeCloseTo(late.fleetCount * 0.2 * 25, 10)
  })
})

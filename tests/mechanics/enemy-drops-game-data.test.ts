import { describe, expect, it } from 'vitest'
import {
  BOSS_REROLL_SHARDS_PROC,
  COMMON_MODULE_DROP_BASE,
  getBossRerollShardCount,
  getCommonModuleDropChance,
  getExpectedBossRerollShardsPerKill,
  getRareModuleDropChance,
  getShatterShards,
  RARE_MODULE_DROP_BASE,
  REROLL_SHARDS_BY_TIER,
  fleetModuleShardsForSpawnWave,
  getFetchRerollShardCount,
  getFleetRewardRow,
  getRerollShardsBaseForTier,
} from '../../src/mechanics/enemies/drops-game-data'

describe('enemy-drops-game-data', () => {
  it('matches drop chance bases at lab 0', () => {
    expect(getCommonModuleDropChance(0)).toBeCloseTo(COMMON_MODULE_DROP_BASE, 6)
    expect(getRareModuleDropChance(0)).toBeCloseTo(RARE_MODULE_DROP_BASE, 6)
  })

  it('scales drop chance with lab benefit × 0.01', () => {
    expect(getCommonModuleDropChance(1)).toBeCloseTo(0.02 + 0.01, 6)
    expect(getRareModuleDropChance(0.5)).toBeCloseTo(0.005 + 0.005, 6)
  })

  it('uses tier reroll shard table plus rounded lab bonus', () => {
    // T10 is 35 since v28.3.1 (patch note 1524807478141780111).
    expect(REROLL_SHARDS_BY_TIER[8]).toBe(35)
    expect(getBossRerollShardCount(10, 0)).toBe(35)
    expect(getBossRerollShardCount(10, 2.4)).toBe(37)
    expect(getExpectedBossRerollShardsPerKill(10, 0)).toBeCloseTo(35 * BOSS_REROLL_SHARDS_PROC, 6)
  })

  it('pays boss reroll shards by tier as game data v29.2.0 and the wiki give them', () => {
    // Wiki "Modules" § Reroll Shards and "Currency/Shards" agree on every tier.
    const expected = [1, 3, 5, 8, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]
    expect(Array.from({ length: 24 }, (_, i) => getRerollShardsBaseForTier(i + 1))).toEqual(expected)
  })

  it('pays Guardian Fetch the same per-tier reroll table as a boss', () => {
    // Game data v29.2.0 reads Fetch and boss reroll shards from one table. Wiki "Currency/Shards"
    // says Fetch pays half the boss amount; the game table does not halve it.
    expect(getFetchRerollShardCount(10, 0)).toBe(getBossRerollShardCount(10, 0))
  })

  it('returns fleet reroll shards by tier, including the high-wave fleets of tiers 1-13', () => {
    expect(getFleetRewardRow(20, 5)).toEqual({ tier: 20, rerollShards: 1950, moduleShardsPerType: 5 })
    expect(getFleetRewardRow(5, 14000)?.rerollShards).toBe(1080)
    expect([22, 23, 24].map(tier => getFleetRewardRow(tier)?.rerollShards)).toEqual([2300, 2500, 2750])
  })

  it('pays fleet module shards by the wave the fleet spawned on, not by tier', () => {
    // Wiki "Fleet Enemies" § Module Shards: 5 for waves 1-249, +1 per 250 waves, 25 from wave 5000.
    expect(fleetModuleShardsForSpawnWave(1)).toBe(5)
    expect(fleetModuleShardsForSpawnWave(249)).toBe(5)
    expect(fleetModuleShardsForSpawnWave(250)).toBe(6)
    expect(fleetModuleShardsForSpawnWave(4999)).toBe(24)
    expect(fleetModuleShardsForSpawnWave(5000)).toBe(25)
    expect(fleetModuleShardsForSpawnWave(12000)).toBe(25)
  })

  it('computes shatter shards from lab benefit and rarity constants', () => {
    // Game data v29.2.0 and wiki "Currency/Shards": Common 5, Rare 10, Rare+ 30, Epic 90.
    expect(getShatterShards('common', 0)).toBe(5)
    expect(getShatterShards('rare', 0)).toBe(10)
    expect(getShatterShards('rarePlus', 0)).toBe(30)
    expect(getShatterShards('epic', 0)).toBe(90)
    expect(getShatterShards('common', 20)).toBe(6)
    expect(getShatterShards('rare', 100)).toBe(20)
  })
})

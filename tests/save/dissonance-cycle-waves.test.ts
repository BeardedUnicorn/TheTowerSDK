import { describe, expect, it } from 'vitest'
import {
  detectDissonanceCycleLayout,
  readDissonanceCycleWaveForTierType,
  readDissonanceCycleWavesFromSaveRoot,
} from '../../src/save/dissonance/waves'

/*
 * `highestWavePerTierThisCycle` in a v29.2 export: 40 slots, one per tier, slot 0 empty. It was
 * read as four dissonance types packed per tier, which put the tier-7 best under "tier 2, uw".
 */
describe('highestWavePerTierThisCycle', () => {
  const save = () => {
    const waves = Array.from({ length: 40 }, () => 0)
    waves[5] = 515
    waves[7] = 2510
    return { highestWavePerTierThisCycle: waves }
  }

  it('is one wave per tier, indexed by tier number', () => {
    const { cycleWaves, layout } = readDissonanceCycleWavesFromSaveRoot(save())
    expect(layout).toBe('per-tier')
    expect(readDissonanceCycleWaveForTierType(cycleWaves, 7, 0, layout)).toBe(2510)
    expect(readDissonanceCycleWaveForTierType(cycleWaves, 7, 3, layout)).toBe(2510)
    expect(readDissonanceCycleWaveForTierType(cycleWaves, 5, 1, layout)).toBe(515)
    expect(readDissonanceCycleWaveForTierType(cycleWaves, 2, 3, layout)).toBe(0)
  })

  it('only treats a list as packed by type when it can hold four types for every tier', () => {
    expect(detectDissonanceCycleLayout(Array.from({ length: 40 }, () => 1))).toBe('per-tier')
    expect(detectDissonanceCycleLayout(Array.from({ length: 96 }, () => 0))).toBe('tier-major')
  })

  it('sizes type-major blocks from the tier count, so tiers 22-24 stay in their own type', () => {
    const waves = Array.from({ length: 96 }, () => 0)
    // One wave per type block, 24 tiers per block.
    for (const block of [0, 24, 48, 72]) waves[block + 23] = 100 + block
    expect(detectDissonanceCycleLayout(waves)).toBe('type-major')
    expect(readDissonanceCycleWaveForTierType(waves, 24, 0, 'type-major')).toBe(100)
    expect(readDissonanceCycleWaveForTierType(waves, 24, 1, 'type-major')).toBe(124)
  })
})

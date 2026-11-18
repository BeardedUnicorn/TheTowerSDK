import { describe, expect, it } from 'vitest'
import { isEchoLabsUnlockedInSave } from '../../src/save/dissonance/waves'

/** `highestWaveThisTier` with the given bests. The save indexes it by tier: slot 0 is empty. */
const reached = (bests: Record<number, number>, currentTier = 1) => ({
  currentTier,
  highestWaveThisTier: Array.from({ length: 25 }, (_, tier) => bests[tier] ?? 0),
})

/*
 * Wiki "Milestones/16 17 18": Dissonance Echo Labs at tier 17 wave 60, tier 18 at tier 17 wave 300.
 * Wiki "Version History/V0.28" and "Dissonance" agree. Tier 4 wave 90 unlocks Dissonance itself.
 */
describe('isEchoLabsUnlockedInSave', () => {
  it('is false at the Dissonance unlock, which is a different milestone', () => {
    expect(isEchoLabsUnlockedInSave(reached({ 4: 90 }, 4))).toBe(false)
    expect(isEchoLabsUnlockedInSave(reached({ 16: 5000 }, 16))).toBe(false)
  })

  it('turns on exactly at tier 17 wave 60', () => {
    expect(isEchoLabsUnlockedInSave(reached({ 17: 59 }, 17))).toBe(false)
    expect(isEchoLabsUnlockedInSave(reached({ 17: 60 }, 17))).toBe(true)
  })

  it('does not depend on the tier the player is sitting on', () => {
    expect(isEchoLabsUnlockedInSave(reached({ 17: 60 }, 3))).toBe(true)
  })

  it('is true on any higher tier, which requires tier 17 wave 300', () => {
    expect(isEchoLabsUnlockedInSave(reached({}, 18))).toBe(true)
    expect(isEchoLabsUnlockedInSave(reached({ 19: 1 }, 2))).toBe(true)
  })

  it('reads a serialised list by _size', () => {
    const waves = Array.from({ length: 25 }, (_, tier) => (tier === 17 ? 60 : 0))
    expect(isEchoLabsUnlockedInSave({ highestWaveThisTier: { _items: waves, _size: 25 } })).toBe(true)
    expect(isEchoLabsUnlockedInSave({ highestWaveThisTier: { _items: waves, _size: 17 } })).toBe(false)
  })

  it('is false for a save with no progress data', () => {
    expect(isEchoLabsUnlockedInSave({})).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { readEffectivePathsSettingsFromSaveRoot } from '../../src/save/effective-paths/settings'
import { readGuardiansFromSaveRoot } from '../../src/save/guardians/read'
import { readUltimateWeaponsFromSaveRoot } from '../../src/save/ultimate-weapons/read'
import { readVaultFromSaveRoot } from '../../src/save/vault/read'
import { coerceSaveArray, normalizePresetLevelMatrix, toNumberArrayPreserveLength } from '../../src/save/workshop/read'

/*
 * A save array's position is its meaning: index 2 of `highestWaveThisTier` is tier 3. So an entry
 * that cannot be read must leave a gap. Dropping it hands every later value to the wrong slot.
 */
describe('an unreadable entry in a positional save array', () => {
  it('does not move later waves onto a lower tier', () => {
    // Indexed by tier: slot 0 is empty, slot 2 unreadable.
    const settings = readEffectivePathsSettingsFromSaveRoot({ highestWaveThisTier: [0, 100, null, 300] })
    expect(settings.highestTier).toBe(3)
    expect(settings.highestWave).toBe(300)
    expect(settings.wavesByTier).toEqual({ 1: 100, 3: 300 })
  })

  it('does not move vault levels onto another node, and says the slot was unreadable', () => {
    const withGap = readVaultFromSaveRoot({ powerNodesLevel: [2, null, 5] })
    const withZero = readVaultFromSaveRoot({ powerNodesLevel: [2, 0, 5] })
    expect(withGap?.powerNodes).toEqual(withZero?.powerNodes)
    expect(withGap?.warnings.join(' ')).toMatch(/unreadable/i)
    expect(withZero?.warnings.join(' ')).not.toMatch(/unreadable/i)
  })

  it('does not move guardian chip levels onto another stat, and says the slot was unreadable', () => {
    const withGap = readGuardiansFromSaveRoot({ guardianChipLevel: [1, null, 3, 7, 8, 9] })
    const withZero = readGuardiansFromSaveRoot({ guardianChipLevel: [1, 0, 3, 7, 8, 9] })
    expect(withGap?.chips).toEqual(withZero?.chips)
    expect(withGap?.warnings.join(' ')).toMatch(/unreadable/i)
    expect(withZero?.warnings.join(' ')).not.toMatch(/unreadable/i)
  })

  it('leaves an ultimate weapon plus level unknown rather than taking the next weapon\'s', () => {
    const extract = readUltimateWeaponsFromSaveRoot({ ultimateWeaponPlusLevel: [1, null, 3] })
    expect(extract?.slots.map(slot => slot.plusLevel)).toEqual([1, null, 3])
    expect(extract?.warnings.join(' ')).toMatch(/unreadable/i)
  })

  it('withholds ultimate weapon base stat levels rather than guessing the missing one', () => {
    const unlocked = [true, true]
    const levels = [1, 2, 3, 4, 5, 6]
    const clean = readUltimateWeaponsFromSaveRoot({ ultimateWeaponUnlocked: unlocked, ultimateWeaponLevel: levels })
    expect(clean?.slots[1]?.baseStatLevels).toEqual([4, 5, 6])

    const gapped = readUltimateWeaponsFromSaveRoot({
      ultimateWeaponUnlocked: unlocked,
      ultimateWeaponLevel: [1, null, 3, 4, 5, 6],
    })
    expect(gapped?.slots.map(slot => slot.baseStatLevels)).toEqual([[], []])
    expect(gapped?.warnings.join(' ')).toMatch(/unreadable/i)
  })

  it('reads a workshop preset the same way the active levels read', () => {
    expect(normalizePresetLevelMatrix([[1, null, 3]])).toEqual([[1, 0, 3]])
    expect(normalizePresetLevelMatrix([1, null, 3])).toEqual([[1, 0, 3]])
  })
})

describe('a serialised List<T> read by the workshop helpers', () => {
  it('stops at _size, because the tail of _items is stale', () => {
    expect(coerceSaveArray({ _items: [5, 99, 0, 0], _size: 1 })).toEqual([5])
    expect(toNumberArrayPreserveLength({ _items: [5, 99, 0, 0], _size: 2 })).toEqual([5, 99])
  })

  it('takes the whole array when the list cannot say how long it is', () => {
    expect(coerceSaveArray({ _items: [5, 99] })).toEqual([5, 99])
  })
})

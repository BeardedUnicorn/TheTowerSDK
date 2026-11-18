import { describe, expect, it } from 'vitest'
import { readToolExportJson } from '../../src/save/access/json'
import { readGuardiansFromSaveRoot } from '../../src/save/guardians/read'

/*
 * Shaped like a v29.2 official export (keys and layout only). Wiki "Guardian": the Guardian comes
 * with one chip slot, the 2nd and 3rd are bought with bits, and it only fights in a guild with a
 * chip equipped. Wiki "Currency/Bits": 2nd slot 200, 3rd 300.
 */
const exportShaped = (inGuild: boolean | undefined) => readToolExportJson(new TextEncoder().encode(JSON.stringify({
  ResearchLevel: [1],
  ...(inGuild === undefined ? {} : { InGuild: inGuild }),
  GuardianUnlocked: true,
  GuardianSlotsUnlocked: 2,
  GuardianChipSlot: [7, 0, 6],
  GuardianChipUnlocked: [true, false, true, false, false, true, true, true, true, false],
  GuardianChipLevel: Array.from({ length: 30 }, (_, i) => (i < 3 ? 5 : 0)),
  CurrentGuardianPreset: 0,
  GuardianPresets: [
    { Unlocked: false, ChipSlot: [7, 0, 6], PresetName: 'Preset 1', ChipLevel: Array.from({ length: 30 }, () => 1), SlotsUnlocked: 2, SkinIndex: 20 },
    { Unlocked: false, ChipSlot: [-1, -1, -1], PresetName: 'Preset 2', ChipLevel: Array.from({ length: 30 }, () => 0), SlotsUnlocked: 0, SkinIndex: 18 },
  ],
})))

describe('guardian from a v29.2 export', () => {
  it('owns the free first chip slot plus the bought ones', () => {
    const guardian = readGuardiansFromSaveRoot(exportShaped(true))!
    expect(guardian.slotsUnlocked).toBe(2)
    expect(guardian.chipSlotCount).toBe(3)
    expect(guardian.equippedChips).toHaveLength(3)
    expect(guardian.warnings.join(' ')).not.toMatch(/chip slots/)
  })

  it('only fights in a guild', () => {
    expect(readGuardiansFromSaveRoot(exportShaped(true))!.activeInBattle).toBe(true)
    expect(readGuardiansFromSaveRoot(exportShaped(false))!.activeInBattle).toBe(false)
    expect(readGuardiansFromSaveRoot(exportShaped(undefined))!.activeInBattle).toBeNull()
  })

  it('reads every guardian preset', () => {
    const guardian = readGuardiansFromSaveRoot(exportShaped(true))!
    expect(guardian.currentPreset).toBe(0)
    expect(guardian.presets.map(p => [p.name, p.chipSlotCount, p.skinIndex])).toEqual([
      ['Preset 1', 3, 20],
      ['Preset 2', 1, 18],
    ])
    expect(guardian.presets[0].equippedSlotIndices).toEqual([7, 0, 6])
    expect(guardian.presets[1].equippedSlotIndices).toEqual([-1, -1, -1])
    expect(guardian.presets[0].chipLevels).toHaveLength(30)
  })
})

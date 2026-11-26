import { describe, expect, it } from 'vitest'

import {
  VAULT_V29_ENEMY,
  VAULT_V29_HARMONY,
  VAULT_V29_POWER,
} from '../../src/data/generated/vault-v29.generated'
import {
  vaultV29CategoryUnlockKey,
  vaultV29CategoryUnlockKeys,
  vaultV29KeyRows,
  vaultV29TreeKeysRemaining,
  vaultV29UpgradeKeysBetween,
  vaultV29UpgradeKeysCost,
  vaultV29UpgradeMaxLevel,
} from '../../src/mechanics/vault/keys'
import { vaultTreeKeysRemaining } from '../../src/mechanics/effective-paths/edamage-costs'
import {
  VAULT_V29_GROUP_UNLOCK_KEYS,
  buildVaultV29LevelKeyIndex,
  readVaultV29ProgressFromSaveRoot,
  vaultV29RowKey,
} from '../../src/save/vault/v29-progress'

const DEFENSE_ABSOLUTE = 'v29:power:Defense:Defense Absolute'

function wholeTree(tree: { categories: readonly { unlockCost: number | null }[], upgrades: readonly { levelCosts: readonly number[] }[] }): number {
  const unlocks = tree.categories.reduce((sum, category) => sum + (category.unlockCost ?? 0), 0)
  const levels = tree.upgrades.reduce((sum, upgrade) => sum + upgrade.levelCosts.reduce((a, b) => a + b, 0), 0)
  return unlocks + levels
}

describe('v29 vault upgrade key costs', () => {
  it('prices Defense Absolute as the v29 vault does, not as the old tree did', () => {
    // The wiki's v29 table: 10, 20, 40, 70, 110. The pre-v29 node `defabs` was 5, 10, 20.
    expect([1, 2, 3, 4, 5].map(level => vaultV29UpgradeKeysCost(DEFENSE_ABSOLUTE, level))).toEqual([10, 20, 40, 70, 110])
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 0, 5)).toBe(250)
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 2, 4)).toBe(110)
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 3, 3)).toBe(0)
    expect(vaultV29UpgradeMaxLevel(DEFENSE_ABSOLUTE)).toBe(5)
  })

  it('prices a multi-level Harmony upgrade and an Enemy row', () => {
    expect(vaultV29UpgradeKeysBetween('v29:harmony:Gameplay:Ad Gem Stack', 0, 4)).toBe(130)
    expect(vaultV29UpgradeKeysCost('v29:enemy:Simple:Basic:Attack (-1%)', 1)).toBe(25)
    expect(vaultV29UpgradeMaxLevel('v29:enemy:Simple:Basic:Attack (-1%)')).toBe(30)
  })

  it('refuses a row or level that does not exist', () => {
    expect(vaultV29UpgradeKeysCost('defabs', 1)).toBeNull()
    expect(vaultV29UpgradeKeysCost(DEFENSE_ABSOLUTE, 0)).toBeNull()
    expect(vaultV29UpgradeKeysCost(DEFENSE_ABSOLUTE, 6)).toBeNull()
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 0, 6)).toBeNull()
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 3, 1)).toBeNull()
    expect(vaultV29UpgradeKeysBetween(DEFENSE_ABSOLUTE, 0.5, 2)).toBeNull()
    expect(vaultV29UpgradeMaxLevel('v29:power:Defense:Nope')).toBeNull()
  })
})

describe('v29 vault category unlocks', () => {
  it('reads each category\'s unlock, and 0 for one open from the start', () => {
    expect(vaultV29CategoryUnlockKeys('power', 'Defense')).toBe(25)
    expect(vaultV29CategoryUnlockKeys('harmony', 'Gameplay')).toBe(0)
    expect(vaultV29CategoryUnlockKeys('harmony', 'Cards')).toBe(5)
    expect(vaultV29CategoryUnlockKeys('power', 'Cards')).toBeNull()
    expect(vaultV29CategoryUnlockKeys('nope', 'Defense')).toBeNull()
  })
})

describe('v29 vault tree totals', () => {
  it('prices a whole tree at every unlock plus every level in the table', () => {
    expect(vaultV29TreeKeysRemaining('harmony')).toBe(wholeTree(VAULT_V29_HARMONY))
    expect(vaultV29TreeKeysRemaining('power')).toBe(wholeTree(VAULT_V29_POWER))
    expect(vaultV29TreeKeysRemaining('enemy')).toBe(wholeTree(VAULT_V29_ENEMY))
  })

  it('is not the pre-v29 total', () => {
    expect(vaultV29TreeKeysRemaining('power')).not.toBe(vaultTreeKeysRemaining('power'))
  })

  it('takes off what is already bought, unlocks included', () => {
    const whole = vaultV29TreeKeysRemaining('power') as number
    expect(vaultV29TreeKeysRemaining('power', { [DEFENSE_ABSOLUTE]: 2 })).toBe(whole - 30)
    expect(vaultV29TreeKeysRemaining('power', {
      [vaultV29CategoryUnlockKey('power', 'Defense')]: 1,
      [DEFENSE_ABSOLUTE]: 5,
    })).toBe(whole - 25 - 250)
  })

  it('ignores the other trees\' keys and refuses a misspelt one', () => {
    const whole = vaultV29TreeKeysRemaining('power') as number
    expect(vaultV29TreeKeysRemaining('power', { 'v29:harmony:Gameplay:Ad Gem Stack': 4 })).toBe(whole)
    expect(vaultV29TreeKeysRemaining('power', { 'v29:power:Defense:Defence Absolute': 1 })).toBeNull()
    expect(vaultV29TreeKeysRemaining('power', { defabs: 1 })).toBeNull()
    expect(vaultV29TreeKeysRemaining('power', { [DEFENSE_ABSOLUTE]: 6 })).toBeNull()
    expect(vaultV29TreeKeysRemaining('power', { [vaultV29CategoryUnlockKey('power', 'Defense')]: 2 })).toBeNull()
    expect(vaultV29TreeKeysRemaining('tier2')).toBeNull()
  })
})

describe('v29 vault row keys agree with the save reader', () => {
  it('names every upgrade the way the save reader does', () => {
    const fromSave = [...buildVaultV29LevelKeyIndex().values()].map(target => target.key).sort()
    const priced = vaultV29KeyRows().map(row => row.key).sort()
    expect(priced).toEqual(fromSave)
  })

  it('names every category unlock the way the save reader does', () => {
    for (const key of Object.values(VAULT_V29_GROUP_UNLOCK_KEYS)) {
      const [, tree, category] = key.split(':')
      expect(vaultV29CategoryUnlockKey(tree as string, category as string)).toBe(key)
      expect(vaultV29CategoryUnlockKeys(tree as string, category as string), key).not.toBeNull()
    }
    expect(vaultV29CategoryUnlockKey('power', 'Defense')).toBe(vaultV29RowKey('power', 'Defense', '__unlock__'))
  })

  it('totals a tree from the levels a save reports', () => {
    const progress = readVaultV29ProgressFromSaveRoot({
      vault: {
        UnlockedGroups: { Elements: [1010] },
        UpgradesLevel: { KeyValuePairs: [{ key: 230, value: 3 }, { key: 1010, value: 2 }] },
      },
    })
    expect(progress?.warnings).toEqual([])
    const whole = vaultV29TreeKeysRemaining('power') as number
    // Defense unlocked (25) and Defense Absolute at 3 (10 + 20 + 40); the Harmony level is not Power's.
    expect(vaultV29TreeKeysRemaining('power', progress?.levels)).toBe(whole - 25 - 70)
  })
})

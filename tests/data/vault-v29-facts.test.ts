import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CARD_TEMPLATES } from '../../src/data/cards/data'
import {
  VAULT_V29_ENEMY,
  VAULT_V29_HARMONY,
  VAULT_V29_POWER,
  type VaultV29Category,
  type VaultV29Requirement,
} from '../../src/data/generated/vault-v29.generated'
import { VAULT_V29_GROUP_UNLOCK_KEYS, vaultV29RowKey } from '../../src/save/vault/v29-progress'

/*
 * Every v29 vault row against game data v29.2.1 (facts/v29.2.1/vault-upgrades.json).
 *
 * The facts hold what the game defines: key cost and total value per level, the value's unit,
 * the game's English label, the upgrade a row builds on, and what must be owned first. The game
 * data showed Max Recovery with its 60% step (20/40/60/80/100), which patch note
 * 1571908572156272841 restored in v29.2. It also showed the Protector special is Radius, not
 * Mass, and Elite Balance Toggle (1320) at 20 keys behind the Enemy Balance mastery.
 */
interface FactRequirement { type: string, value: number, card?: string }
interface FactUpgrade {
  vaultId: number
  internalName: string
  name: string
  group: string
  enemyType: string | null
  unit: string
  dependsOn: number | null
  requirements: FactRequirement[]
  levels: { value: number, keyCost: number }[]
}
interface FactGroup {
  group: string
  groupId: number
  tree: string
  name: string
  unlockCost: number
  requirements: FactRequirement[]
  upgradeIds: number[]
}
const facts: { gameVersion: string, groups: FactGroup[], upgrades: FactUpgrade[], idsWithoutData: { vaultId: number }[] }
  = JSON.parse(readFileSync(new URL('../../facts/v29.2.1/vault-upgrades.json', import.meta.url), 'utf8'))
const byId = new Map(facts.upgrades.map(u => [u.vaultId, u]))

const CATEGORY: Record<string, string> = {
  Harmony_Gameplay: 'Gameplay', Harmony_Cards: 'Cards', Harmony_Ultimate: 'Ultimate Weapons',
  Harmony_Modules: 'Modules', Harmony_Bots: 'Bots', Harmony_Workshop: 'Workshop', Harmony_Guardian: 'Guardians',
  Power_Attack: 'Attack', Power_Defense: 'Defense', Power_Utility: 'Utility', Power_Ultimate: 'Ultimate Weapons',
  Enemy_Simple: 'Simple', Enemy_Advanced: 'Advanced', Enemy_Elite: 'Elites', Enemy_Fleets: 'Fleets',
}
const UNIT: Record<string, string> = {
  None: 'plain', Percentage1: 'fraction', Percentage100: 'percent', Seconds: 'seconds',
  Time: 'time', Meters: 'meters', Angle: 'degrees',
}
const KIND: Record<string, string> = {
  Card: 'card', CardMastery: 'cardMastery', UltimateWeapon: 'ultimateWeapon', TournamentLeague: 'tournamentLeague',
}
const TREES = { harmony: VAULT_V29_HARMONY, power: VAULT_V29_POWER, enemy: VAULT_V29_ENEMY } as const
const rows = [
  ...VAULT_V29_HARMONY.upgrades.map(u => ({ ...u, label: u.name, tree: 'harmony' })),
  ...VAULT_V29_POWER.upgrades.map(u => ({ ...u, label: u.name, tree: 'power' })),
  ...VAULT_V29_ENEMY.upgrades.map(u => ({ ...u, label: `${u.enemy}:${u.stat}`, tree: 'enemy', dependsOn: undefined, requirements: undefined })),
]
/** Not buyable: both need the Bastion card, which is not released. */
const EXCLUDED = new Map([[1300, 'Bastion card'], [1310, 'Bastion card']])

const squash = (s: string) => s.replace(/\W/g, '').toLowerCase()
function expectedRequirements(list: FactRequirement[]) {
  return list.map(r => ({ kind: KIND[r.type], value: r.value }))
}
function actualRequirements(list: readonly VaultV29Requirement[] | undefined) {
  return (list ?? []).map(r => ({ kind: r.kind, value: r.value }))
}

describe('the v29 vault, as game data v29.2.1 has it', () => {
  it('reads facts for the right build', () => {
    expect(facts.gameVersion).toBe('v29.2.1')
    expect(facts.upgrades).toHaveLength(119)
    expect(facts.groups).toHaveLength(15)
  })

  it.each(rows.map(r => [r.vaultId, r.label, r] as const))('%i %s matches the game', (_id, _label, row) => {
    const fact = byId.get(row.vaultId as number)
    expect(fact, 'the game defines this upgrade').toBeDefined()
    if (!fact) return
    expect(row.category).toBe(CATEGORY[fact.group])
    expect(row.levelCosts).toEqual(fact.levels.map(l => l.keyCost))
    expect(row.levelValues).toEqual(fact.levels.map(l => l.value))
    expect(row.unit).toBe(UNIT[fact.unit])
    expect(row.gameName).toBe(fact.name)
    expect(row.dependsOn ?? null).toBe(fact.dependsOn)
    expect(actualRequirements(row.requirements)).toEqual(expectedRequirements(fact.requirements))
  })

  it('lists every upgrade the game defines, except the ones that cannot be bought', () => {
    const listed = new Set(rows.map(r => r.vaultId))
    const missing = facts.upgrades.filter(u => !listed.has(u.vaultId) && !EXCLUDED.has(u.vaultId))
    expect(missing.map(u => `${u.vaultId} ${u.name}`)).toEqual([])
    for (const id of EXCLUDED.keys()) expect(listed.has(id)).toBe(false)
  })

  it('leaves out Bastion Automation because the Bastion card is not released', () => {
    for (const id of EXCLUDED.keys()) {
      expect(byId.get(id)?.requirements).toEqual([{ type: 'Card', value: 36, card: 'Bastion' }])
    }
    expect(CARD_TEMPLATES.some(c => squash(c.name) === 'bastion')).toBe(false)
  })

  it('names the card each card requirement points at', () => {
    for (const row of rows) {
      for (const req of row.requirements ?? []) {
        if (req.kind !== 'card' && req.kind !== 'cardMastery') continue
        const card = CARD_TEMPLATES.find(c => c.id === req.cardId)
        const fact = byId.get(row.vaultId as number)?.requirements.find(r => r.value === req.value)
        expect(card && squash(card.name), `${row.label} -> ${req.cardId}`).toBe(squash(fact?.card ?? ''))
      }
    }
  })

  it('opens each category for the keys the game asks, behind the same requirements', () => {
    for (const group of facts.groups) {
      const tree = TREES[group.tree as keyof typeof TREES]
      const category: VaultV29Category | undefined = tree.categories.find(c => c.name === CATEGORY[group.group])
      expect(category?.unlockCost, group.group).toBe(group.unlockCost)
      expect(category?.autoUnlocked, group.group).toBe(group.unlockCost === 0)
      expect(actualRequirements(category?.requirements), group.group).toEqual(expectedRequirements(group.requirements))
    }
  })

  it('keeps each category in the order the game shows it', () => {
    for (const group of facts.groups) {
      const tree = TREES[group.tree as keyof typeof TREES]
      const ids = tree.upgrades.filter(u => u.category === CATEGORY[group.group]).map(u => u.vaultId)
      const expected = group.upgradeIds.filter(id => !EXCLUDED.has(id))
      // Rows are listed by id; the game shows Elite Balance Toggle between 1270 and 1280.
      expect([...ids].sort((a, b) => (a ?? 0) - (b ?? 0)), group.group).toEqual([...expected].sort((a, b) => a - b))
    }
  })

  it('maps every game group number to the save reader unlock key', () => {
    for (const group of facts.groups) {
      expect(VAULT_V29_GROUP_UNLOCK_KEYS[group.groupId], group.group)
        .toBe(vaultV29RowKey(group.tree, CATEGORY[group.group], '__unlock__'))
    }
  })

  it('has the Max Recovery ladder with its 60% step', () => {
    const maxRecovery = VAULT_V29_POWER.upgrades.find(u => u.vaultId === 490)
    expect(maxRecovery?.levelValues).toEqual([20, 40, 60, 80, 100])
    expect(maxRecovery?.unit).toBe('percent')
  })

  it('names ids the game reserves without defining an upgrade', () => {
    expect(facts.idsWithoutData.map(x => x.vaultId)).toEqual([6221, 6222])
  })
})

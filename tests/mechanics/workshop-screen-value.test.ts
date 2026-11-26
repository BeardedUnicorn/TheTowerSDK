import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CARD_TEMPLATES, computeLabValueAtLevel, findToolLabBySlug, WORKSHOP_DATA } from '../../src/data'
import { formatGameNumber } from '../../src/formatting'
import {
  computeWorkshopScreenValue,
  dissonantBoostOfType,
  totalRelicBenefitByStat,
  WORKSHOP_SCREEN_FORMULA_BY_STAT,
} from '../../src/mechanics'
import type { WorkshopScreenInput, WorkshopScreenModule } from '../../src/mechanics'

/*
 * The Workshop screen of 2026-11-24 (facts/v29.2.2/live-ui-check.json), rebuilt by one function
 * from the account's own inputs. Before `computeWorkshopScreenValue`, each of these was composed by
 * hand from five SDK parts; the facts record the formula each one needed.
 *
 * The inputs go in whole, as a save would supply them: all fifteen active cards, all four modules,
 * every relic and both boosts. A formula that read one source too many would fail here as surely
 * as one that read one too few.
 */

interface Facts {
  workshopValues: { stat: string, level: number, shown: string }[]
  workshopScreen: {
    labLevels: Record<string, number>
    labValues: Record<string, number>
    activeCards: { slug: string, name: string, level: number }[]
    cardValues: Record<string, number>
    composed: { stat: string, level: number, shown: string, formula: string }[]
    unconfirmed: { stat: string, level: number, shown: string, fits: string }[]
  }
  modules: { type: string, rarity: string, level: number, effects: { effectId: number }[] }[]
  relics: { unlockedIndices: number[], totals: Record<string, string> }
  dissonance: { tier: number, boostWaves: Record<'attack' | 'defense', number[]> }
}

const facts = JSON.parse(
  readFileSync(new URL('../../facts/v29.2.2/live-ui-check.json', import.meta.url), 'utf8'),
) as Facts
const screen = facts.workshopScreen

/** The last number in an on-screen string, and how many decimals the screen gave it. */
const shownNumber = (shown: string): { value: number, decimals: number } => {
  const all = shown.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g)!
  const last = all[all.length - 1]
  return { value: Number(last), decimals: last.split('.')[1]?.length ?? 0 }
}

/** Compact numbers (189.91K) are written by `formatGameNumber`; the rest round to the shown decimals. */
const asShown = (value: number, shown: string): string | number =>
  /\d[KMBT]$/.test(shown) ? formatGameNumber(value) : Number(value.toFixed(shownNumber(shown).decimals))

const { tier, boostWaves } = facts.dissonance
const account: Omit<WorkshopScreenInput, 'stat' | 'level'> = {
  labLevels: screen.labLevels,
  relicBenefitByStat: totalRelicBenefitByStat(facts.relics.unlockedIndices),
  cards: screen.activeCards.map(card => ({ slug: card.slug, level: card.level, active: true })),
  modules: facts.modules.map((module): WorkshopScreenModule => ({
    category: module.type,
    rarityLabel: module.rarity,
    level: module.level,
    substatEffectIds: module.effects.map(effect => effect.effectId),
  })),
  dissonantBoost: {
    attack: dissonantBoostOfType('attack', boostWaves.attack[tier], boostWaves.attack, 0),
    defense: dissonantBoostOfType('defense', boostWaves.defense[tier], boostWaves.defense, 0),
  },
}

const table = (stat: string, level: number): number =>
  (WORKSHOP_DATA as unknown as Record<string, Record<string, { value: number }>>)[stat][String(level)].value

describe('the inputs, as the facts record them', () => {
  it.each(Object.entries(screen.labLevels))('lab %s at level %i gives the recorded value', (slug, level) => {
    expect(computeLabValueAtLevel(findToolLabBySlug(slug)!, level)).toBeCloseTo(screen.labValues[slug], 9)
  })

  it.each(Object.entries(screen.cardValues))('card %s gives %d at its level', (slug, value) => {
    const level = screen.activeCards.find(card => card.slug === slug)!.level
    expect(CARD_TEMPLATES.find(template => template.id === slug)!.levelValues[level - 1]).toBe(value)
  })

  it('totals the relics the way the Relics screen does', () => {
    const totals = account.relicBenefitByStat!
    for (const [stat, shown] of Object.entries(facts.relics.totals)) {
      expect((totals[stat] ?? 0) * 100).toBeCloseTo(shownNumber(shown).value, 9)
    }
    // A relic listed twice is still one relic.
    expect(totalRelicBenefitByStat([...facts.relics.unlockedIndices, facts.relics.unlockedIndices[0]])).toEqual(totals)
  })
})

describe('the Workshop screen on 2026-11-24', () => {
  it.each(screen.composed)('$stat level $level shows $shown', ({ stat, level, shown, formula }) => {
    const result = computeWorkshopScreenValue({ ...account, stat, level })!
    expect(result).not.toBeNull()
    expect(result.basis).toBe('composed')
    expect(result.formula).toBe(formula)
    expect(result.unread).toEqual([])
    expect(asShown(result.value, shown)).toBe(/\d[KMBT]$/.test(shown) ? shown : shownNumber(shown).value)
  })

  it.each(facts.workshopValues)('$stat level $level shows the table value $shown', ({ stat, level, shown }) => {
    const result = computeWorkshopScreenValue({ ...account, stat, level })!
    expect(result.basis).toBe('table')
    expect(result.value).toBe(table(stat, level))
    expect(result.unread).toEqual([])
    expect(result.value).toBeCloseTo(shownNumber(shown).value, 2)
  })

  it('covers exactly the readings the screen settled', () => {
    const byBasis = (basis: string) => Object.entries(WORKSHOP_SCREEN_FORMULA_BY_STAT)
      .filter(([, formula]) => formula.basis === basis).map(([stat]) => stat).sort()
    // Health Regen and Defense Absolute were settled a day later, on a second preset
    // (`workshop-screen-value-second-preset.test.ts`); this day had them at level 0.
    const settledLater = ['Defense Absolute', 'Health Regen']
    expect(byBasis('composed')).toEqual([...screen.composed.map(row => row.stat), ...settledLater].sort())
    expect(byBasis('table')).toEqual(facts.workshopValues.map(row => row.stat).sort())
  })
})

describe('Knockback Force, which the screen could not settle', () => {
  const [reading] = screen.unconfirmed

  it('has no formula, so the function gives no number', () => {
    expect(reading.stat).toBe('Knockback Force')
    expect(WORKSHOP_SCREEN_FORMULA_BY_STAT['Knockback Force']).toBeUndefined()
    expect(computeWorkshopScreenValue({ ...account, stat: reading.stat, level: reading.level })).toBeNull()
  })

  it('fits only with the attack boost on a defense stat, as the facts say', () => {
    const relic = 1 + account.relicBenefitByStat!.KnockbackForce
    expect((table(reading.stat, reading.level) * relic * account.dissonantBoost!.attack!).toFixed(2)).toBe(reading.shown)
    expect((table(reading.stat, reading.level) * relic).toFixed(2)).not.toBe(reading.shown)
  })
})

describe('inputs left out', () => {
  it('are neutral, so a bare level gives the table value through its formula', () => {
    expect(computeWorkshopScreenValue({ stat: 'Damage', level: 805 })!.value).toBe(table('Damage', 805))
    expect(computeWorkshopScreenValue({ stat: 'Range', level: 79 })!.value).toBeCloseTo(table('Range', 79) * 10, 9)
    expect(computeWorkshopScreenValue({ stat: 'Defense Percent', level: 99 })!.value).toBe(table('Defense Percent', 99))
  })

  it('include an inactive card', () => {
    const cards = account.cards!.map(card => ({ ...card, active: card.slug !== 'hp' }))
    const withCard = computeWorkshopScreenValue({ ...account, stat: 'Health', level: 1142 })!.value
    expect(computeWorkshopScreenValue({ ...account, cards, stat: 'Health', level: 1142 })!.value).toBeCloseTo(withCard / 4, 3)
  })

  it('return null for an upgrade with no formula or a level the table does not have', () => {
    expect(computeWorkshopScreenValue({ stat: 'Knockback Force', level: 40 })).toBeNull()
    expect(computeWorkshopScreenValue({ stat: 'Wall Health', level: 0 })).toBeNull()
    expect(computeWorkshopScreenValue({ stat: 'Damage', level: 1e6 })).toBeNull()
    expect(computeWorkshopScreenValue({ stat: 'toString', level: 0 })).toBeNull()
  })
})

describe('module categories', () => {
  // computeModuleStat silently gives x1.000 for `Cannon`; the save reader returns `Cannon`.
  it('read the same in either case', () => {
    const lower = account.modules!.map(module => ({ ...module, category: module.category.toLowerCase() }))
    const damage = computeWorkshopScreenValue({ ...account, stat: 'Damage', level: 805 })!.value
    expect(computeWorkshopScreenValue({ ...account, modules: lower, stat: 'Damage', level: 805 })!.value).toBe(damage)
    expect(damage / computeWorkshopScreenValue({ ...account, modules: [], stat: 'Damage', level: 805 })!.value).toBeCloseTo(1.7, 9)
  })
})

describe('a source the formula does not read', () => {
  const cannon = account.modules!.find(module => module.category === 'Cannon')!

  it('is listed, not silently dropped or silently added', () => {
    // Effect 32 is an Epic +5% Multishot Chance; 9 an Epic +4% Critical Chance.
    const modules = account.modules!.map(module => module === cannon
      ? { ...module, substatEffectIds: [...module.substatEffectIds, 32, 9] }
      : module)
    const multishot = computeWorkshopScreenValue({ ...account, modules, stat: 'Multishot Chance', level: 99 })!
    expect(multishot.value).toBe(table('Multishot Chance', 99))
    expect(multishot.unread).toEqual(['Cannon substat Multishot Chance 5'])

    const crit = computeWorkshopScreenValue({
      ...account,
      modules,
      relicBenefitByStat: { ...account.relicBenefitByStat, CriticalChance: 0.02 },
      cards: [...account.cards!, { slug: 'dmg', level: 7, active: true }],
      stat: 'Critical Chance',
      level: 79,
    })!
    expect(crit.value).toBe(91)
    expect(crit.unread).toEqual(['CriticalChance relics 0.02', 'Cannon substat Critical Chance 4'])
  })

  it('includes a card named for the stat, and an assist module of a type the formula reads', () => {
    const damage = computeWorkshopScreenValue({
      ...account,
      cards: [...account.cards!, { slug: 'dmg', level: 7, active: true }],
      modules: [...account.modules!, { ...cannon, role: 'assist' }],
      stat: 'Damage',
      level: 805,
    })!
    expect(damage.unread).toEqual(['assist Cannon module', 'Damage card level 7'])
  })
})

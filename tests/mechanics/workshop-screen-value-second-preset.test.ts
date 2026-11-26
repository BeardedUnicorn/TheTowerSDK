import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeDiscountedWorkshopCost, WORKSHOP_DATA, workshopLabLevelToSectionDiscountPercent } from '../../src/data'
import { formatGameNumber } from '../../src/formatting/numbers/game-notation'
import {
  computeWorkshopScreenValue,
  dissonantBoostOfType,
  totalRelicBenefitByStat,
  WORKSHOP_SCREEN_FORMULA_BY_STAT,
} from '../../src/mechanics'
import type { WorkshopScreenInput, WorkshopScreenModule } from '../../src/mechanics'

/**
 * The Workshop screen on a second preset, a day later.
 *
 * `facts/v29.2.3/workshop-dissonant-preset.json` is what the game showed on 2026-11-25 for the
 * account's Dissonant workshop preset: other levels of the same upgrades, with Health Regen and
 * Defense Absolute bought, which the first preset had at 0. A formula that only fitted the first
 * day's numbers would fail here. It also carries the Farm rows that moved overnight, when the
 * Free Upgrades card was put in.
 *
 * Modules and the dissonance boost were unchanged, so those come from the first day's facts.
 */
interface Reading { stat: string, level: number, shown: string, section?: string, price?: string }
interface Second {
  labLevels: Record<string, number>
  relics: { unlockedIndices: number[] }
  activeCards: { slug: string, level: number }[]
  readings: Required<Reading>[]
  farmReadings: Reading[]
  unconfirmed: Reading[]
  discountLabLevels: Record<string, number>
}
interface First {
  modules: { type: string, rarity: string, level: number, effects: { effectId: number }[] }[]
  dissonance: { tier: number, boostWaves: Record<'attack' | 'defense', number[]> }
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T
const second = read<Second>('../../facts/v29.2.3/workshop-dissonant-preset.json')
const first = read<First>('../../facts/v29.2.2/live-ui-check.json')

const { tier, boostWaves } = first.dissonance
const account: Omit<WorkshopScreenInput, 'stat' | 'level'> = {
  labLevels: second.labLevels,
  relicBenefitByStat: totalRelicBenefitByStat(second.relics.unlockedIndices),
  cards: second.activeCards.map(card => ({ slug: card.slug, level: card.level, active: true })),
  modules: first.modules.map((module): WorkshopScreenModule => ({
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

/** The number in an on-screen string, and how many decimals the screen gave it. */
const shownNumber = (shown: string): { value: number, decimals: number } => {
  const [number] = shown.replace(/,/g, '').match(/\d+(?:\.\d+)?/)!
  return { value: Number(number), decimals: number.split('.')[1]?.length ?? 0 }
}

/** A value as the screen would print it: compact numbers are cut, the rest rounded. */
const asShown = (value: number, shown: string): string | number =>
  /\d[KMBT]\b/.test(shown) ? formatGameNumber(value) : Number(value.toFixed(shownNumber(shown).decimals))
const expected = (shown: string): string | number =>
  /\d[KMBT]\b/.test(shown) ? shown.match(/[\d.]+[KMBT]/)![0] : shownNumber(shown).value

const screen = (reading: Reading) => computeWorkshopScreenValue({ ...account, stat: reading.stat, level: reading.level })

describe('the Dissonant preset on 2026-11-25', () => {
  it.each(second.readings)('$stat level $level shows $shown', (reading) => {
    const result = screen(reading)
    expect(result, reading.stat).not.toBeNull()
    expect(result!.unread).toEqual([])
    expect(asShown(result!.value, reading.shown)).toBe(expected(reading.shown))
  })

  it.each(second.readings)('$stat level $level costs $price for the next level', ({ stat, level, section, price }) => {
    const row = (WORKSHOP_DATA as unknown as Record<string, Record<string, { coins: number }>>)[stat][String(level)]
    const discount = workshopLabLevelToSectionDiscountPercent(second.discountLabLevels[section])
    expect(formatGameNumber(computeDiscountedWorkshopCost(row.coins, discount))).toBe(price)
  })
})

describe('Health Regen and Defense Absolute, which the first preset had at level 0', () => {
  const regen = second.readings.find(reading => reading.stat === 'Health Regen')!
  const absolute = second.readings.find(reading => reading.stat === 'Defense Absolute')!

  it('Health Regen is the table times its lab, its relics and the Armor substat', () => {
    const result = screen(regen)!
    expect(result.formula).toBe('table × Health Regen lab × (1 + HealthRegen relics) × (1 + Armor Health Regen substat)')
    expect(result.unit).toBe('amount')
    expect(formatGameNumber(result.value)).toBe('448.00K')
  })

  it('each of the three sources is needed to reach 448.00K', () => {
    const without = (change: Partial<typeof account>): string =>
      formatGameNumber(computeWorkshopScreenValue({ ...account, ...change, stat: regen.stat, level: regen.level })!.value)
    expect(without({ labLevels: { ...second.labLevels, health_regen: 0 } })).not.toBe('448.00K')
    expect(without({ relicBenefitByStat: { ...account.relicBenefitByStat, HealthRegen: 0 } })).toBe('430.77K')
    expect(without({ modules: [] })).toBe('280.00K')
  })

  it('Defense Absolute is the table times its lab and its relics', () => {
    const result = screen(absolute)!
    expect(result.formula).toBe('table × Defense Absolute lab × (1 + TowerDefenseAbs relics)')
    expect(formatGameNumber(result.value)).toBe('339.58K')
    expect(formatGameNumber(computeWorkshopScreenValue({
      ...account, relicBenefitByStat: {}, stat: absolute.stat, level: absolute.level,
    })!.value)).toBe('285.36K')
  })

  it('still shows nothing useful at level 0, which is why the first preset could not settle them', () => {
    expect(screen({ stat: 'Health Regen', level: 0, shown: '0.00/sec' })!.value.toFixed(2)).toBe('0.00')
    expect(screen({ stat: 'Defense Absolute', level: 0, shown: '0' })!.value).toBe(0)
  })
})

describe('the Farm rows that moved overnight', () => {
  it.each(second.farmReadings)('$stat level $level shows $shown', (reading) => {
    const result = screen(reading)!
    expect(result.unread).toEqual([])
    expect(asShown(result.value, reading.shown)).toBe(expected(reading.shown))
  })

  it('the Free Upgrades card is what moved the three chances, by its 9 points', () => {
    const noCard = { ...account, cards: account.cards!.filter(card => card.slug !== 'freeups') }
    const shown = (stat: string, input: typeof account): string =>
      computeWorkshopScreenValue({ ...input, stat, level: 99 })!.value.toFixed(2)
    // The day before, without the card, the screen read 53.46 / 59.80 / 58.65.
    expect(shown('Free Attack Upgrade', noCard)).toBe('53.46')
    expect(shown('Free Defense Upgrade', noCard)).toBe('59.80')
    expect(shown('Free Utility Upgrade', noCard)).toBe('58.65')
    expect(shown('Free Attack Upgrade', account)).toBe('63.18')
  })
})

describe('what is still not settled', () => {
  it('Knockback Force has no formula, and the second preset did not change that', () => {
    const [reading] = second.unconfirmed
    expect(reading.stat).toBe('Knockback Force')
    expect(WORKSHOP_SCREEN_FORMULA_BY_STAT['Knockback Force']).toBeUndefined()
    expect(screen(reading)).toBeNull()
  })

  it('Rend Armor and the Wall have none either: they are locked and their rows were never seen', () => {
    for (const stat of ['Rend Armor Chance', 'Rend Armor Mult', 'Wall Health', 'Wall Rebuild']) {
      expect(WORKSHOP_SCREEN_FORMULA_BY_STAT[stat], stat).toBeUndefined()
    }
  })
})

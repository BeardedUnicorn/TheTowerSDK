import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CARD_TEMPLATES } from '../../src/data/cards/data'
import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { parseDuration } from '../../src/formatting/numbers/compute'

/*
 * Lab ladders against game data v29.2.1 (facts/v29.2.1/labs.json), with no cost or time modifier.
 *
 * The fleet labs (246-248) were a scaled copy of an enemy-lab curve, rounded to two digits
 * (2.3e21 where the game has 2.25e21). Each level costs exactly 1.5x the one before and takes
 * 400 h longer. Global Presets was a copy of Card Presets level 1; the game asks 1e14 coins and
 * 960 h. Card Presets L1-5 and Primary Module Bonus were already right and are pinned here.
 * The card masteries are the lab's base benefit plus its increase per level. Land Mine Stun
 * runs 2.5% to 25%, where the SDK had 2.7% to 27%.
 */
interface FactLevel { level: number, cost: number, seconds: number, benefit: number }
interface FactLab { index: number, slug: string, levelMax: number, levels: FactLevel[] }
interface FactMastery { slug: string, name: string, values: number[] }
const facts: { gameVersion: string, labs: FactLab[], cardMasteries: FactMastery[] }
  = JSON.parse(readFileSync(new URL('../../facts/v29.2.1/labs.json', import.meta.url), 'utf8'))

const bySlug = new Map(LAB_CATALOG.map(row => [row.slug, row]))

/** Lab slugs that are not derived from the card name. */
const MASTERY_SLUG: Readonly<Record<string, string>> = {
  'Recovery Package Chance': 'recovery_package_mastery',
}
const masterySlug = (cardName: string) =>
  MASTERY_SLUG[cardName] ?? `${cardName.toLowerCase().replaceAll(' ', '_')}_mastery`

describe('lab ladders, as game data v29.2.1 has them', () => {
  it('reads facts for the right build', () => {
    expect(facts.gameVersion).toBe('v29.2.1')
  })

  it.each(facts.labs.map(lab => [lab.slug, lab] as const))('%s costs and takes what the game asks at every level', (slug, lab) => {
    const row = bySlug.get(slug)
    expect(row, `${slug} is in LAB_CATALOG`).toBeDefined()
    const levels = (row?.levels ?? []).filter(level => level.level > 0)
    expect(levels.map(level => level.level)).toEqual(lab.levels.map(level => level.level))
    for (const [i, level] of levels.entries()) {
      expect(level.cost, `${slug} L${level.level} cost`).toBe(lab.levels[i].cost)
      expect(parseDuration(level.duration), `${slug} L${level.level} time`).toBeCloseTo(lab.levels[i].seconds, 3)
    }
  })

  it('steps each fleet and primary-module lab by the value the game adds per level', () => {
    // The catalog shows the fleet labs in display units (0.5 for 0.5%); the game stores 0.005.
    const scale: Readonly<Record<string, number>> = { overcharge_exponent_reducer: 100 }
    for (const lab of facts.labs.filter(lab => lab.levelMax === 30)) {
      const step = lab.levels[1].benefit - lab.levels[0].benefit
      const value = bySlug.get(lab.slug)?.value
      expect(typeof value, lab.slug).toBe('number')
      expect(Math.abs(value as number), lab.slug).toBeCloseTo(step * (scale[lab.slug] ?? 1), 6)
    }
  })

  it.each(CARD_TEMPLATES.map(card => [card.name, card] as const))('%s mastery has the game values', (_name, card) => {
    const fact = facts.cardMasteries.find(mastery => mastery.slug === masterySlug(card.name))
    expect(fact, masterySlug(card.name)).toBeDefined()
    const scale = card.masteryType === 'percent' ? 100 : 1
    // The SDK shows Ultimate Crit's thirds of a percent to one decimal (0.3 for 0.333...).
    for (const [level, value] of card.masteryValues.entries()) {
      expect(Math.abs(value - fact!.values[level] * scale), `${card.name} L${level}`).toBeLessThanOrEqual(0.05 + 1e-9)
    }
  })

  it('has Land Mine Stun at 2.5% steps', () => {
    const lms = CARD_TEMPLATES.find(card => card.id === 'lms')
    expect(lms?.masteryValues).toEqual([2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25])
  })
})

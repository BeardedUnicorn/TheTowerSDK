import { describe, expect, it } from 'vitest'
import { cardMasteryCostData } from '../../src/charts/tables/data'
import { CARD_TEMPLATES } from '../../src/data/cards/data'
import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { CARD_MASTERY_NAME_TO_CARD } from '../../src/knowledge/compartments/masteries'

/**
 * The SDK keeps card mastery values in three hand-owned tables: the card templates, the mastery
 * labs and the chart table. Every error fixed here was a typo in one or two of them that the
 * remaining copy contradicted, so the copies are checked against each other.
 */

const card = (id: string) => {
  const template = CARD_TEMPLATES.find(candidate => candidate.id === id)
  if (!template) throw new Error(`no card ${id}`)
  return template
}

/** Lab slugs are not derived from the card name for this card. */
const LAB_SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  'Recovery Package Chance': 'recovery_package_mastery',
}

const labSlugFor = (cardName: string): string =>
  LAB_SLUG_OVERRIDES[cardName] ?? `${cardName.toLowerCase().replaceAll(' ', '_')}_mastery`

const labValues = (cardName: string): number[] => {
  const lab = LAB_CATALOG.find(row => row.slug === labSlugFor(cardName))
  if (!lab) throw new Error(`no mastery lab for ${cardName} (tried ${labSlugFor(cardName)})`)
  return Object.keys(lab.value ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map(level => (lab.value as Record<string, number>)[level])
}

describe('card mastery values', () => {
  it('agree between the card templates and the mastery labs', () => {
    for (const template of CARD_TEMPLATES) {
      expect(labValues(template.name), template.name).toEqual(template.masteryValues)
    }
  })

  it('agree between the card templates and the chart table', () => {
    for (const row of cardMasteryCostData.rows) {
      const name = CARD_MASTERY_NAME_TO_CARD[row.card] ?? row.card
      const template = CARD_TEMPLATES.find(candidate => candidate.name === name)
      expect(template, `chart row ${row.card}`).toBeDefined()
      const charted = template!.masteryValues.map((_, level) => {
        const value = Math.abs(Number.parseFloat(String(row[`level${level}`]).replace(/^[x+]/, '')))
        // The chart shows Slow Aura's +5% attack delay as x1.05; the card stores 5.
        return row.card === 'Slow Aura' ? Math.round((value - 1) * 100) : value
      })
      expect(charted, row.card).toEqual(template!.masteryValues.map(Math.abs))
    }
  })

  it('gives every card its own mastery name', () => {
    const names = CARD_TEMPLATES.map(template => template.masteryName)
    expect(new Set(names).size).toBe(names.length)
  })

  // Values from the wiki's Card Masteries table, read 2026-11-06.
  it.each([
    ['cash', 'Elite Farming', [0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4]],
    ['crit-chance', 'Super Critical Chance', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['eb', 'Elite Balance', [6, 12, 18, 24, 30, 36, 42, 48, 54, 60]],
    ['ws', 'Double Wave Skip', [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]],
    ['rpc', 'Care Package', [0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4]],
  ])('keeps the corrected %s row', (id, masteryName, values) => {
    expect(card(id).masteryName).toBe(masteryName)
    expect(card(id).masteryValues).toEqual(values)
    expect(labValues(card(id).name)).toEqual(values)
  })
})

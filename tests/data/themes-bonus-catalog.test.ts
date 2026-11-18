import { describe, expect, it } from 'vitest'

import {
  listThemeBonusCatalogEntries,
  THEME_CATEGORY_BONUS,
  THEMES,
} from '../../src/data/themes/bonus-catalog'
import { THEME_CATEGORY_DEFINITIONS } from '../../src/data/themes/catalog'
import { THEME_CATALOG } from '../../src/save/catalogs/indexes.data'

/**
 * The catalog used to carry a `bonus` string on every item — 169 literals
 * encoding 7 numbers. These tests pin the derivation to what those literals
 * said, so removing them cannot have moved a published value.
 */

/**
 * Counts per category. Raised from 54/53/21/3/19/9/10 when the lists caught up with the save's
 * theme catalog (tiers 22-24 skins, and the items added since).
 */
const EXPECTED_COUNTS: Record<string, number> = {
  TOWER: 60,
  BACKGROUND: 59,
  MILESTONE: 24,
  SONGS: 3,
  GUARDIAN: 21,
  MENU: 11,
  PROFILE_BANNER: 12,
}

describe('theme bonus catalog', () => {
  it('lists every theme the save catalog names, so no owned item goes unpriced', () => {
    // The lists lagged the save catalog by 21 items, including the tier 22-24 milestone skins.
    const fold = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/banner$/, '')
    const lists: Record<string, readonly { name: string }[]> = {
      tower: [...THEMES.TOWER, ...THEMES.MILESTONE],
      background: THEMES.BACKGROUND,
      menu: THEMES.MENU,
      profileBanner: THEMES.PROFILE_BANNER,
      guardian: THEMES.GUARDIAN,
      song: THEMES.SONGS,
    }
    for (const row of THEME_CATALOG as readonly { category: string; label: string }[]) {
      const names = new Set((lists[row.category] ?? []).map(item => fold(item.name)))
      expect(names.has(fold(row.label)), `${row.category} "${row.label}" is not in the bonus catalog`).toBe(true)
    }
  })

  it('still lists every theme it did before', () => {
    for (const [category, count] of Object.entries(EXPECTED_COUNTS)) {
      expect(THEMES[category as keyof typeof THEMES], category).toHaveLength(count)
    }
    const total = Object.values(EXPECTED_COUNTS).reduce((sum, n) => sum + n, 0)
    expect(listThemeBonusCatalogEntries()).toHaveLength(total)
  })

  it('derives the same bonus each item used to state', () => {
    // Every entry in a category carried exactly this string.
    expect(THEME_CATEGORY_BONUS).toEqual({
      TOWER: '+0.4%',
      BACKGROUND: '+0.8%',
      MILESTONE: '+0.4%',
      SONGS: '+0.6%',
      GUARDIAN: '+0.6%',
      MENU: '+0.6%',
      PROFILE_BANNER: '+0.6%',
    })

    for (const entry of listThemeBonusCatalogEntries()) {
      expect(entry.bonus).toBe(THEME_CATEGORY_BONUS[entry.category])
    }
  })

  it('agrees with the category coefficients used by the coin formula', () => {
    // Two representations of one rate. They overlap on four categories, and a
    // disagreement means the formula and the catalog would pay differently.
    const pairs: [keyof typeof THEME_CATEGORY_BONUS, string][] = [
      ['TOWER', 'tower'],
      ['BACKGROUND', 'background'],
      ['MENU', 'menu'],
      ['GUARDIAN', 'guardian'],
    ]

    for (const [catalogKey, definitionKey] of pairs) {
      const definition = THEME_CATEGORY_DEFINITIONS.find(entry => entry.key === definitionKey)
      expect(definition, definitionKey).toBeDefined()
      expect(THEME_CATEGORY_BONUS[catalogKey], catalogKey).toBe(
        definition!.passiveCoinBonusPerOwnedDisplay.replace(/^/, '+'),
      )
    }
  })

  it('gives every theme a name', () => {
    const unnamed = listThemeBonusCatalogEntries().filter(entry => !entry.name.trim())
    expect(unnamed).toEqual([])
  })
})

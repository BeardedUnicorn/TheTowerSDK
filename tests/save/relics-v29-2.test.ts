import { describe, expect, it } from 'vitest'
import { findRelicTemplateIdForSaveIndex, listUnlockedRelics, readRelicsFromSaveRoot } from '../../src/save/relics/read'

/*
 * Relic slots 321-335 as game data v29.2.0 defines them (facts/v29.2.0/relics.json). A v29.2
 * export unlocked 321, 322 and 326, which read as "Relic 322/323/327" before these rows existed.
 */
describe('relics added in v29.1-v29.2', () => {
  const relicsUnlocked = Array.from({ length: 350 }, () => 0)
  for (const index of [321, 322, 326]) relicsUnlocked[index] = 2

  it('names the Fractals and Rainfall relics a save unlocks', () => {
    const extract = readRelicsFromSaveRoot({ relicsUnlocked })!
    expect(listUnlockedRelics(extract).map(relic => relic.label)).toEqual(['Hex Flower', 'Chained Hex', 'Rain Gauge'])
  })

  it('joins each new slot to its template', () => {
    expect(findRelicTemplateIdForSaveIndex(321)).toBe('1-Rare-v29-321')
    expect(findRelicTemplateIdForSaveIndex(323)).toBe('1-Rare-v29-323')
    expect(findRelicTemplateIdForSaveIndex(335)).toBe('2-Epic-v29-335')
    // 325 exists in the game but was not out at v29.2.0.
    expect(findRelicTemplateIdForSaveIndex(325)).toBeNull()
  })
})

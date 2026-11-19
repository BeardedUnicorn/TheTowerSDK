import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { GUARDIAN_SKIN_IMPORT_CATALOG, THEME_CATALOG } from '../../src/save/catalogs/indexes.data'
import { readThemesFromSaveRoot } from '../../src/save/themes/read'

/*
 * Every theme slot against game data v29.2.1 (facts/v29.2.1/theme-names.json), by the index the
 * save uses.
 *
 * Songs are indexed by trackAvailable. The game shows the event songs as tracks 4, 5 and 8, so
 * the former rows 6 "Oceans Sings" and 7 "Hiding in Himalaya" named the wrong tracks. Each name
 * now sits on its own track: row names are persisted by consumers, so 4 keeps the spelling
 * "Krisu - Oceans Sings" and carries the game's wording as its label.
 */
const facts = JSON.parse(readFileSync(new URL('../../facts/v29.2.1/theme-names.json', import.meta.url), 'utf8'))
const CATEGORIES = [
  ['tower', 'tower'],
  ['background', 'background'],
  ['menu', 'menu'],
  ['profileBanner', 'profileBanner'],
  ['guardian', 'guardianSkin'],
  ['song', 'song'],
] as const

describe('theme slots, as game data v29.2.1 has them', () => {
  it('reads facts for the right build', () => {
    expect(facts.gameVersion).toBe('v29.2.1')
  })

  it.each(CATEGORIES)('%s has the game name at every index', (category, key) => {
    const rows = new Map<number, { name: string, label: string }>(
      THEME_CATALOG.filter(row => row.category === category).map(row => [row.catalogIndex, row]),
    )
    const game: string[] = facts[key]
    const wrong = game.flatMap((name, index) => (rows.get(index)?.label === name ? [] : [`${index}: game="${name}" label="${rows.get(index)?.label}"`]))
    expect(wrong).toEqual([])
    expect([...rows.keys()].filter(index => index >= game.length), 'rows past the slots the game defines').toEqual([])
  })

  it('keeps a persisted song name on the track it belongs to', () => {
    const songs = THEME_CATALOG.filter(row => row.category === 'song')
    expect(songs.find(row => row.catalogIndex === 4)?.name).toBe('Krisu - Oceans Sings')
    expect(songs.find(row => row.catalogIndex === 5)?.name).toBe('Krisu - Hiding in Himalaya')
    expect(songs.find(row => row.catalogIndex === 8)?.name).toBe('Krisu - Forest Bathing')
  })

  it('lists every guardian skin for import with the same save fields', () => {
    expect(GUARDIAN_SKIN_IMPORT_CATALOG.map(row => row.name)).toEqual(facts.guardianSkin)
    for (const row of GUARDIAN_SKIN_IMPORT_CATALOG) {
      expect(row.saveFields).toEqual({ unlocked: 'guardianSkinUnlocked', selected: 'guardianSkinIndex' })
    }
  })

  it('names newer slots when a save unlocks them', () => {
    const extract = readThemesFromSaveRoot({
      guardianSkinUnlocked: [true, ...Array(21).fill(false), true],
      trackAvailable: [true, false, false, false, true, false, true, false, false, false, false, false],
    })
    const named = extract?.unlocked.map(row => `${row.category}:${row.index}:${row.name}`)
    expect(named).toEqual(expect.arrayContaining([
      'guardian:22:Pal',
      'song:0:Faodail - Wren',
      'song:4:Krisu - The Ocean Sings',
      'song:6:Krisu - The Ethereal and I',
    ]))
    expect(extract?.warnings ?? []).toEqual([])
  })
})

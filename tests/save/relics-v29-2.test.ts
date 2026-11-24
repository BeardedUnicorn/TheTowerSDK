import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RELIC_GAME_TABLE } from '../../src/data/generated/relic-game-table.generated'
import { readEventsFromSaveRoot } from '../../src/save/events/read'
import { EVENT_RELIC_SETS, findEventRelicSet } from '../../src/save/events/relic-sets'
import { listRelicCatalogRows } from '../../src/save/catalogs/relics'
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
    // 325 exists in the game but is not out yet, so it has a catalog row and no template.
    expect(findRelicTemplateIdForSaveIndex(325)).toBeNull()
  })
})

/*
 * The game defines 350 relic slots (facts/v29.2.0/relics.json) and a v29.2 export carries all of
 * them. Slots 325, 330-333 and 336-349 had no catalog row and read as "Relic 326" and so on.
 */
describe('every relic slot the game defines', () => {
  const facts = JSON.parse(readFileSync(new URL('../../facts/v29.2.0/relics.json', import.meta.url), 'utf8')) as {
    relics: { index: number, internalName: string, rarity: string, benefit: number, benefitType: string, unlockType: string, unlockCost: number, releaseDate: string }[]
  }
  const relicsUnlocked = Array.from({ length: 350 }, () => 0)
  relicsUnlocked[326] = 2
  relicsUnlocked[327] = 1

  it('has a catalog row and a game row for each of the 350', () => {
    expect(listRelicCatalogRows().map(row => row.index)).toEqual(facts.relics.map(relic => relic.index))
    expect(RELIC_GAME_TABLE).toHaveLength(350)
    for (const relic of facts.relics) {
      expect(RELIC_GAME_TABLE[relic.index]).toEqual({
        index: relic.index, internalName: relic.internalName, rarity: relic.rarity, benefit: relic.benefit,
        stat: relic.benefitType, unlockType: relic.unlockType, unlockCost: relic.unlockCost, releaseDate: relic.releaseDate,
      })
    }
  })

  it('names every slot of a 350-slot save and says what each relic grants', () => {
    const extract = readRelicsFromSaveRoot({ relicsUnlocked })!
    expect(extract.relics).toHaveLength(350)
    expect(extract.relics.filter(relic => relic.name === null)).toEqual([])
    expect(extract.relics[325]).toMatchObject({ label: 'Turkey', unlockType: 'Purchase', stat: 'FreeAttackUpgrade', benefit: 0.02 })
    expect(extract.relics[333]).toMatchObject({ label: 'Lycan Essence', rarity: 'Epic', unlockType: 'Medals', unlockCost: 1100, event: 'Howling Wolf' })
    expect(extract.relics[340]).toMatchObject({ label: 'Knitted Socks', stat: 'BotRange', benefit: 1, releaseDate: '2026-12-08' })
    expect(extract.relics[326]).toMatchObject({
      label: 'Rain Gauge', event: 'Rainfall', unlockCost: 350, unlockDescription: 'Earn 350 medals during the Rainfall event',
    })
  })

  it('tells a mailed relic from an unlocked one', () => {
    const extract = readRelicsFromSaveRoot({ relicsUnlocked })!
    expect(extract.relics[326]).toMatchObject({ unlocked: true, state: 'unlocked' })
    expect(extract.relics[327]).toMatchObject({ unlocked: true, state: 'mailed' })
    expect(extract.relics[0]).toMatchObject({ unlocked: false, state: 'locked' })
    expect(extract.mailedCount).toBe(1)
    expect(extract.warnings.join(' ')).toMatch(/1 relic\(s\) are mailed/)
    // A save that stores plain flags has no state to report.
    expect(readRelicsFromSaveRoot({ relicsUnlocked: [true, false] })!.relics[0]).toMatchObject({ unlocked: true, state: null })
  })

  it('warns when a save has more slots than the catalog', () => {
    const warnings = readRelicsFromSaveRoot({ relicsUnlocked: Array.from({ length: 354 }, () => 0) })!.warnings
    expect(warnings.join(' ')).toMatch(/relicsUnlocked has 354 entries; catalog has 350\. Relics 350-353 are newer/)
  })
})

describe('unlock text against the game table', () => {
  const kindOf = (text: string): string | null => {
    if (/ medals during /.test(text)) return 'Medals'
    if (/Guild Store/.test(text)) return 'Guild'
    if (/^Gift /.test(text)) return 'Gift'
    if (/^Beat wave /.test(text)) return 'Tier'
    if (/^Play for /.test(text)) return 'PlayTime'
    if (/Tournament/.test(text)) return 'Tournament'
    return null
  }

  it('agrees on how every relic is unlocked, and on the medals an event relic takes', () => {
    // Six rows used to disagree: Starlight Yarn and Galactic Beverage (296, 297) carried the Season 10
    // Guild Store text, Manta Ray and Pearl Shell (303, 304) carried an event text, and Cat Tome and
    // Celestial Fishbones (298, 299) said 350 and 700 medals where the game takes 550 and 1100.
    for (const row of listRelicCatalogRows()) {
      const game = RELIC_GAME_TABLE[row.index]!
      const text = row.unlockDescription ?? ''
      const kind = kindOf(text)
      if (kind) expect(kind, `${row.index} ${row.label}: ${text}`).toBe(game.unlockType)
      const medals = text.match(/^Earn (\d+) medals/)?.[1]
      if (medals) expect(Number(medals), `${row.index} ${row.label}`).toBe(game.unlockCost)
    }
  })

  it('gives each guild season its relics in 75 and 150 token pairs, Season 10 included', () => {
    const bySeason = new Map<string, number[]>()
    for (const row of listRelicCatalogRows()) {
      const season = row.unlockDescription?.match(/Season (\d+) Guild Store/)?.[1]
      if (season) bySeason.set(season, [...(bySeason.get(season) ?? []), RELIC_GAME_TABLE[row.index]!.unlockCost])
    }
    expect(bySeason.get('10')).toEqual([75, 150])
    for (const [season, costs] of bySeason) {
      expect(costs.length % 2, `season ${season}`).toBe(0)
      costs.forEach((cost, position) => expect(cost, `season ${season}`).toBe(position % 2 === 0 ? 75 : 150))
    }
  })
})

describe('event relics', () => {
  it('groups relics by the event their unlock text names', () => {
    expect(findEventRelicSet('Fractals')!.relics.map(relic => [relic.label, relic.medals, relic.needsEventPass])).toEqual([
      ['Hex Flower', 350, false], ['Chained Hex', 700, false], ['Elite Fractal', 550, true], ['Fractal Core', 1100, true],
    ])
    // Every relic an event set holds is a medal relic in the game table, at the medals the text says.
    for (const set of EVENT_RELIC_SETS) {
      for (const relic of set.relics) {
        expect(RELIC_GAME_TABLE[relic.index]!.unlockType, `${set.event} ${relic.label}`).toBe('Medals')
        expect(relic.medals, `${set.event} ${relic.label}`).toBe(RELIC_GAME_TABLE[relic.index]!.unlockCost)
      }
    }
    // The newest four of the Meowy Night relics; the event's first run has its own two before them.
    expect(findEventRelicSet('MEOWY_NIGHT')!.relics.slice(-4).map(relic => [relic.label, relic.medals])).toEqual([
      ['Starlight Yarn', 350], ['Galactic Beverage', 700], ['Cat Tome', 550], ['Celestial Fishbones', 1100],
    ])
  })

  it('finds an event by the name a save writes', () => {
    expect(findEventRelicSet('SANDS_OF_TIME')!.event).toBe('Sands of Time')
    expect(findEventRelicSet('What time is it?')!.event).toBe('What Time Is It')
    expect(findEventRelicSet('NO_SUCH_EVENT')).toBeNull()
    expect(findEventRelicSet(null)).toBeNull()
  })

  it('names the relics an event record lists', () => {
    const extract = readEventsFromSaveRoot({
      lastEventNumber: 100,
      eventRecords: [{ eventNumber: 100, eventName: 'RAINFALL', medals: 745, relicsUnlocked: [326, 327, 9999] }],
    })!
    expect(extract.records[0]).toMatchObject({
      name: 'RAINFALL',
      event: 'Rainfall',
      relicsUnlocked: [326, 327, 9999],
      relics: [{ index: 326, label: 'Rain Gauge' }, { index: 327, label: 'Thunder Strike' }, { index: 9999, label: null }],
    })
  })
})

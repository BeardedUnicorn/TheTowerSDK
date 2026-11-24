import { describe, expect, it } from 'vitest'

import {
  EVENT_RELIC_SETS, findEventRelicSet, findThemeSourceEvent, readEventShopFromSaveRoot, readEventsFromSaveRoot,
  selectEventRelicEdition,
} from '../../src/save'

/*
 * The Howling Wolf event (event 101, v29.2.2 build 1296), read on the game's own screens on
 * 2026-11-24. Event screen: free relics Wolf Paw at 350 medals and Midnight Forest at 700; event
 * boost relics Fang Amulet at 550 and Lycan Essence at 1100. Event Shop: the Howling Wolf tower
 * theme for 150 medals, the Mountain Night background for 250, and under RELICS Dreamcatcher for
 * 200 and Spirit Wolf for 500. Those two are Full Moon's relics from 2023: the shop sells them, the
 * event does not award them. An earlier version reported them as the 350 and 700 medal rewards.
 */
function exportRoot(eventName: string, owned: number[] = [], date = '2026-11-24T04:55:16.931Z'): Record<string, unknown> {
  const relicsUnlocked = Array.from({ length: 350 }, () => 0)
  for (const index of owned) relicsUnlocked[index] = 2
  return {
    lastEventNumber: 101,
    totalMedalsCurrentEvent: 45,
    eventRecords: [
      { eventNumber: 100, date: '2026-11-24T00:00:47.554Z', eventName: 'RAINFALL', medals: 745, medalsSpent: 1400, relicsUnlocked: [326, 327] },
      { eventNumber: 101, date, eventName, medals: 45, medalsSpent: 0, relicsUnlocked: [] },
    ],
    relicsUnlocked,
  }
}

describe('the Howling Wolf event', () => {
  it('is an event of its own, not Full Moon', () => {
    expect(findEventRelicSet('HOWLING_WOLF')?.event).toBe('Howling Wolf')
    expect(findEventRelicSet('Howling Wolf')?.relics.map(relic => relic.index)).toEqual([330, 331, 332, 333])
    expect(findEventRelicSet('Full Moon')?.relics.map(relic => relic.label)).toEqual(['Dreamcatcher', 'Spirit Wolf'])
    expect(readEventsFromSaveRoot(exportRoot('HOWLING_WOLF'))!.records.at(-1)!.event).toBe('Howling Wolf')
  })

  it('names the event its themes came from, apart from the event itself', () => {
    expect(findThemeSourceEvent('HOWLING_WOLF')).toBe('Full Moon')
    expect(findThemeSourceEvent('RAINFALL')).toBe('Rainfall')
    expect(findThemeSourceEvent('NOT_A_THEME')).toBeNull()
    expect(findThemeSourceEvent(null)).toBeNull()
  })

  it('still resolves an event named directly, and nothing for an unknown name', () => {
    expect(findEventRelicSet('RAINFALL')?.event).toBe('Rainfall')
    expect(findEventRelicSet('NOT_AN_EVENT')).toBeNull()
    expect(findEventRelicSet(null)).toBeNull()
  })
})

/*
 * Relic slots 276-295 are five sets of four, awarded by five consecutive events in mid-2026. They
 * were filed one event out of step, under older events' names: the catalog said relic 292 (Ancient
 * Art) was a Cthulhu relic, where a real save lists 292 among the relics its SANDS_OF_TIME event
 * unlocked. That save earned 650, 370, 485, 535 and 420 medals in METEOR_SHOWER, PRISMATIC_LINES,
 * INTERSTELLAR, JURASSIC and SANDS_OF_TIME, and holds exactly the 350-medal relic of each set
 * (276, 280, 284, 288, 292) and none of the 700-medal ones.
 */
describe('the mid-2026 event relics', () => {
  const labelsOf = (name: string) => findEventRelicSet(name)!.relics.map(relic => relic.label)

  it('files the meteor relics under Meteor Shower', () => {
    expect(findEventRelicSet('METEOR_SHOWER')?.event).toBe('Meteor Shower')
    expect(labelsOf('METEOR_SHOWER')).toEqual(['Mining Drone', 'Meteor Impact', 'Precious Minerals', 'Asteroid Belt'])
  })

  it('files the fossil relics under Jurassic', () => {
    expect(findEventRelicSet('JURASSIC')?.event).toBe('Jurassic')
    expect(labelsOf('JURASSIC')).toEqual(['Ancient Footprint', 'Hunter\'s Realm', 'Spiral Nautilus', 'Tyrant\'s Skull'])
  })

  it('files the pyramid relics under Sands of Time, not Cthulhu', () => {
    expect(labelsOf('SANDS_OF_TIME')).toEqual(expect.arrayContaining(['Ancient Art', 'Ancient Knowledge', 'Ancient Writing', 'Grand Pyramid']))
    expect(labelsOf('SANDS_OF_TIME')).not.toContain('Ancient Footprint')
    expect(labelsOf('Cthulhu')).not.toContain('Ancient Art')
  })

  it('files the light relics under Prismatic Lines and the space relics under Interstellar', () => {
    expect(labelsOf('PRISMATIC_LINES')).toEqual(expect.arrayContaining(['Prismatic Star', 'Rainbow', 'Light Spectrum', 'Light Scattering']))
    expect(labelsOf('INTERSTELLAR')).toEqual(expect.arrayContaining(['Flying Object', 'Space Nebula', 'Binary System', 'Rogue Planet']))
    expect(labelsOf('INTERSTELLAR')).not.toContain('Mining Drone')
    expect(findEventRelicSet('Faster Than Light')!.relics.map(relic => relic.label)).not.toContain('Rainbow')
    expect(findEventRelicSet('Gravity')!.relics.map(relic => relic.label)).not.toContain('Space Nebula')
  })

  it('names the Jurassic and Meteor Shower themes and the relics those events award', () => {
    const jurassic = readEventShopFromSaveRoot(exportRoot('JURASSIC', [288], '2026-08-18T00:00:00.000Z'))!
    expect(jurassic.themes.map(theme => [theme.kind, theme.name])).toEqual([['tower', 'Baby Dino'], ['background', 'Jurassic Forest']])
    expect(jurassic.earnTrack.map(relic => [relic.label, relic.medals, relic.needsEventPass, relic.owned])).toEqual([
      ['Ancient Footprint', 350, false, true], ['Spiral Nautilus', 550, true, false],
      ['Hunter\'s Realm', 700, false, false], ['Tyrant\'s Skull', 1100, true, false],
    ])
    // The shelf of past relics was never read in game for this event, so none is claimed.
    expect(jurassic.relics).toEqual([])
    expect(jurassic.warnings.join(' ')).toMatch(/past relics/)
    const meteor = readEventShopFromSaveRoot(exportRoot('METEOR_SHOWER', [], '2026-07-07T00:00:00.000Z'))!
    expect(meteor.themes.map(theme => theme.name)).toEqual(['Meteorite', 'Meteor Shower'])
    expect(meteor.earnTrack.filter(relic => !relic.needsEventPass).map(relic => relic.label)).toEqual(['Mining Drone', 'Meteor Impact'])
  })
})

describe('event relic sets', () => {
  it('carry the shop price beside the earn threshold', () => {
    const relics = findEventRelicSet('Full Moon')!.relics
    expect(relics.find(relic => relic.label === 'Dreamcatcher')).toMatchObject({
      rarity: 'Rare', medals: 350, shopPrice: { price: 200, currency: 'medals' }, rotatingShopPrice: { price: 600, currency: 'gems' },
    })
    expect(relics.find(relic => relic.label === 'Spirit Wolf')).toMatchObject({
      rarity: 'Epic', medals: 700, shopPrice: { price: 500, currency: 'medals' }, rotatingShopPrice: { price: 1200, currency: 'gems' },
    })
  })

  it('file the clock relics the catalog once described with the event name alone', () => {
    expect(findEventRelicSet('What time is it?')!.relics.map(relic => relic.index)).toEqual([119, 120, 125, 126, 236, 237, 238, 239])
  })

  it('open a new edition at each 350 medal relic, each with one free pair', () => {
    for (const set of EVENT_RELIC_SETS) {
      expect(set.editions, set.event).toBe(set.relics.filter(relic => relic.medals === 350).length)
      for (let edition = 1; edition <= set.editions; edition += 1) {
        const free = set.relics.filter(relic => relic.edition === edition && relic.needsEventPass === false)
        expect(free.map(relic => relic.medals), `${set.event} #${edition}`).toEqual([350, 700])
      }
    }
    expect(findEventRelicSet('Cherry Blossom')!.editions).toBe(4)
    expect(findEventRelicSet('Dark Strands')!.relics.map(relic => [relic.index, relic.edition])).toEqual([
      [52, 1], [53, 1], [117, 2], [118, 2], [127, 2], [128, 2], [313, 3], [314, 3], [315, 3], [316, 3],
    ])
  })
})

/*
 * The event records of a real v29.2.2 export (build 1296): the event, the date the save gives it
 * and the relics it unlocked. Every one is the newest edition of its event at that date.
 */
describe('the edition an event record belongs to', () => {
  const records: [string, string, number[]][] = [
    ['SANDS_OF_TIME', '2026-09-01', [292]],
    ['MEOWY_NIGHT', '2026-09-15', [296]],
    ['STEAMPUNK', '2026-09-29', [309, 310]],
    ['DARK_STRANDS', '2026-10-13', [313, 314]],
    ['ABDUCTION', '2026-10-27', [317, 318]],
    ['FRACTALS', '2026-11-10', [321, 322]],
    ['RAINFALL', '2026-11-24', [326, 327]],
  ]

  it.each(records)('%s on %s awards the relics the save unlocked', (name, date, unlocked) => {
    const edition = selectEventRelicEdition(findEventRelicSet(name)!, date).map(relic => relic.index)
    expect(edition).toEqual(expect.arrayContaining(unlocked))
    expect(edition).toHaveLength(4)
  })

  it('takes the run of the date, and the newest without one', () => {
    const rainfall = findEventRelicSet('RAINFALL')!
    expect(selectEventRelicEdition(rainfall, '2026-11-24T00:00:47.554Z').map(relic => relic.index)).toEqual([326, 327, 328, 329])
    expect(selectEventRelicEdition(rainfall, '2024-06-01').map(relic => relic.index)).toEqual([72, 73])
    expect(selectEventRelicEdition(rainfall).map(relic => relic.index)).toEqual([326, 327, 328, 329])
    expect(selectEventRelicEdition(rainfall, '2020-01-01').map(relic => relic.index)).toEqual([326, 327, 328, 329])
  })
})

describe('the current event shop', () => {
  it('gives the Howling Wolf relic track the game shows', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF', [330]))!
    expect(shop).toMatchObject({ event: 'Howling Wolf', saveName: 'HOWLING_WOLF', eventNumber: 101, medalsCurrentEvent: 45 })
    expect(shop.earnTrack).toEqual([
      { index: 330, label: 'Wolf Paw', rarity: 'Rare', medals: 350, needsEventPass: false, owned: true },
      { index: 332, label: 'Fang Amulet', rarity: 'Rare', medals: 550, needsEventPass: true, owned: false },
      { index: 331, label: 'Midnight Forest', rarity: 'Epic', medals: 700, needsEventPass: false, owned: false },
      { index: 333, label: 'Lycan Essence', rarity: 'Epic', medals: 1100, needsEventPass: true, owned: false },
    ])
  })

  it('lists the Howling Wolf shop at the prices the game charges', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF'))!
    expect(shop.themes).toEqual([
      { kind: 'tower', name: 'Howling Wolf', price: 150, currency: 'medals', coinBonus: '+0.4%' },
      { kind: 'background', name: 'Mountain Night', price: 250, currency: 'medals', coinBonus: '+0.8%' },
    ])
    expect(shop.relics).toEqual([
      { index: 26, label: 'Dreamcatcher', rarity: 'Rare', price: 200, currency: 'medals', fromEvent: 'Full Moon', owned: false },
      { index: 27, label: 'Spirit Wolf', rarity: 'Epic', price: 500, currency: 'medals', fromEvent: 'Full Moon', owned: false },
    ])
    expect(shop.rotatingRelicPrices).toEqual([
      { rarity: 'Rare', price: 600, currency: 'gems' },
      { rarity: 'Epic', price: 1200, currency: 'gems' },
    ])
    expect(shop.songs.map(song => [song.name, song.price, song.currency, song.coinBonus])).toEqual([
      ['Krisu - Oceans Sings', 200, 'medals', '+0.6%'],
      ['Krisu - Hiding in Himalaya', 200, 'medals', '+0.6%'],
      ['Krisu - Forest Bathing', 200, 'medals', '+0.6%'],
    ])
  })

  it('never offers a relic the shop sells as one the event awards', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF'))!
    const sold = new Set(shop.relics.map(relic => relic.index))
    expect(shop.earnTrack.some(relic => sold.has(relic.index))).toBe(false)
    expect(shop.relics.every(relic => !('earnThreshold' in relic))).toBe(true)
  })

  it('says which of the shop relics the save already holds', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF', [27]))!
    expect(shop.relics.map(relic => [relic.label, relic.owned])).toEqual([['Dreamcatcher', false], ['Spirit Wolf', true]])
  })

  it('awards a returning event its newest relics only', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('RAINFALL', [326, 327], '2026-11-24T00:00:47.554Z'))!
    expect(shop.earnTrack.map(relic => relic.index)).toEqual([326, 328, 327, 329])
  })

  it('warns that the rotating line-up is not in the save', () => {
    expect(readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF'))!.warnings.join(' ')).toMatch(/Rotating Relics/)
  })

  it('keeps the prices and names nothing for an event it does not know', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('NOT_AN_EVENT'))!
    expect(shop.event).toBeNull()
    expect(shop.themes).toEqual([])
    expect(shop.earnTrack).toEqual([])
    expect(shop.relics).toEqual([])
    expect(shop.rotatingRelicPrices).toHaveLength(2)
    expect(shop.warnings.join(' ')).toMatch(/NOT_AN_EVENT/)
  })

  it('is null for a save with no event data', () => {
    expect(readEventShopFromSaveRoot({})).toBeNull()
    expect(readEventShopFromSaveRoot(null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { findEventRelicSet, readEventShopFromSaveRoot, readEventsFromSaveRoot } from '../../src/save'

/*
 * The Howling Wolf event (event 101, v29.2.2) is a rerun of Full Moon. The save names it
 * `HOWLING_WOLF`, after its tower theme; the relic text says "Full Moon". Its shop sold the Howling
 * Wolf tower theme for 150 medals, the Mountain Night background for 250, Dreamcatcher for 200 and
 * Spirit Wolf for 500 — not the 350 and 700 medals it takes to earn those two relics.
 */
function exportRoot(eventName: string, owned: number[] = []): Record<string, unknown> {
  const relicsUnlocked = Array.from({ length: 350 }, () => 0)
  for (const index of owned) relicsUnlocked[index] = 2
  return {
    lastEventNumber: 101,
    totalMedalsCurrentEvent: 45,
    eventRecords: [
      { eventNumber: 100, date: '2026-11-24T00:00:47.554Z', eventName: 'RAINFALL', medals: 745, medalsSpent: 1400, relicsUnlocked: [326, 327] },
      { eventNumber: 101, date: '2026-11-24T04:55:16.931Z', eventName, medals: 45, medalsSpent: 0, relicsUnlocked: [] },
    ],
    relicsUnlocked,
  }
}

describe('an event the save names after its tower theme', () => {
  it('resolves to the event its relics name', () => {
    expect(findEventRelicSet('HOWLING_WOLF')?.event).toBe('Full Moon')
    expect(findEventRelicSet('Howling Wolf')?.event).toBe('Full Moon')
    expect(findEventRelicSet('Full Moon')?.event).toBe('Full Moon')
    expect(readEventsFromSaveRoot(exportRoot('HOWLING_WOLF'))!.records.at(-1)!.event).toBe('Full Moon')
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

  it('names the Jurassic and Meteor Shower shops', () => {
    const jurassic = readEventShopFromSaveRoot(exportRoot('JURASSIC', [288]))!
    expect(jurassic.themes.map(theme => [theme.kind, theme.name])).toEqual([['tower', 'Baby Dino'], ['background', 'Jurassic Forest']])
    expect(jurassic.relics.map(relic => [relic.label, relic.price, relic.owned])).toEqual([['Ancient Footprint', 200, true], ['Hunter\'s Realm', 500, false]])
    const meteor = readEventShopFromSaveRoot(exportRoot('METEOR_SHOWER'))!
    expect(meteor.themes.map(theme => theme.name)).toEqual(['Meteorite', 'Meteor Shower'])
    expect(meteor.relics.map(relic => relic.label)).toEqual(['Mining Drone', 'Meteor Impact'])
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
})

describe('the current event shop', () => {
  it('lists the Howling Wolf shop at the prices the game charges', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF'))!
    expect(shop).toMatchObject({ event: 'Full Moon', saveName: 'HOWLING_WOLF', eventNumber: 101, medalsCurrentEvent: 45 })
    expect(shop.themes).toEqual([
      { kind: 'tower', name: 'Howling Wolf', price: 150, currency: 'medals', coinBonus: '+0.4%' },
      { kind: 'background', name: 'Mountain Night', price: 250, currency: 'medals', coinBonus: '+0.8%' },
    ])
    expect(shop.relics).toEqual([
      { index: 26, label: 'Dreamcatcher', rarity: 'Rare', price: 200, currency: 'medals', earnThreshold: 350, owned: false },
      { index: 27, label: 'Spirit Wolf', rarity: 'Epic', price: 500, currency: 'medals', earnThreshold: 700, owned: false },
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

  it('says which of the event relics the save already holds', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF', [27]))!
    expect(shop.relics.map(relic => [relic.label, relic.owned])).toEqual([['Dreamcatcher', false], ['Spirit Wolf', true]])
  })

  it('warns that the rotating line-up is not in the save', () => {
    expect(readEventShopFromSaveRoot(exportRoot('HOWLING_WOLF'))!.warnings.join(' ')).toMatch(/Rotating Relics/)
  })

  it('keeps the prices and names nothing for an event it does not know', () => {
    const shop = readEventShopFromSaveRoot(exportRoot('NOT_AN_EVENT'))!
    expect(shop.event).toBeNull()
    expect(shop.themes).toEqual([])
    expect(shop.relics).toEqual([])
    expect(shop.rotatingRelicPrices).toHaveLength(2)
    expect(shop.warnings.join(' ')).toMatch(/NOT_AN_EVENT/)
  })

  it('is null for a save with no event data', () => {
    expect(readEventShopFromSaveRoot({})).toBeNull()
    expect(readEventShopFromSaveRoot(null)).toBeNull()
  })
})

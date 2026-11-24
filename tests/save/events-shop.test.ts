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

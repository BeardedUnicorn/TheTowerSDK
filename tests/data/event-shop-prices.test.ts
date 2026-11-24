import { describe, expect, it } from 'vitest'

import { EVENT_SHOP_PRICES, findEventShopPrice } from '../../src/data'

/*
 * The event shop as the game showed it in v29.2.2 during the Howling Wolf event (2026-11-24):
 * tower theme 150 medals, background 250, Dreamcatcher (Rare) 200, Spirit Wolf (Epic) 500, and on
 * the Rotating Relics shelf Shining Light (Rare) 600 gems, Rainbow and Space Nebula (Epic) 1200
 * gems. The song price is the wiki's ("Events" → Event Shop): all three were already purchased.
 */
describe('event shop prices', () => {
  it('prices the event themes in medals', () => {
    expect(findEventShopPrice('towerTheme')).toEqual({ price: 150, currency: 'medals' })
    expect(findEventShopPrice('backgroundTheme')).toEqual({ price: 250, currency: 'medals' })
    expect(findEventShopPrice('song')).toEqual({ price: 200, currency: 'medals' })
  })

  it('prices the event relics in medals by rarity', () => {
    expect(findEventShopPrice('relic', 'Rare')).toEqual({ price: 200, currency: 'medals' })
    expect(findEventShopPrice('relic', 'Epic')).toEqual({ price: 500, currency: 'medals' })
  })

  it('prices rotating relics in gems, not medals', () => {
    expect(findEventShopPrice('rotatingRelic', 'Rare')).toEqual({ price: 600, currency: 'gems' })
    expect(findEventShopPrice('rotatingRelic', 'Epic')).toEqual({ price: 1200, currency: 'gems' })
  })

  it('has no price for a rarity the shop does not sell, or a relic with no rarity', () => {
    expect(findEventShopPrice('relic', 'Legendary')).toBeNull()
    expect(findEventShopPrice('relic')).toBeNull()
    expect(findEventShopPrice('rotatingRelic', null)).toBeNull()
  })

  it('holds one row per item kind and rarity', () => {
    const keys = EVENT_SHOP_PRICES.map(row => `${row.item}/${row.rarity}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(EVENT_SHOP_PRICES).toHaveLength(7)
  })
})

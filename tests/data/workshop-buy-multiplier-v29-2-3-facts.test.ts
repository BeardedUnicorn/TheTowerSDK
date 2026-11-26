import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  computeWorkshopUpgradePrice,
  WORKSHOP_DATA,
  workshopCoinCostBetween,
  workshopLabLevelToSectionDiscountPercent,
} from '../../src/data'
import { formatGameNumber } from '../../src/formatting/numbers/game-notation'

/**
 * The buy multiplier, against the Workshop screen.
 *
 * `facts/v29.2.3/workshop-buy-multiplier.json` is what the game showed on 2026-11-25 for the fifteen
 * upgrades that could still be bought, at x1, x5, x10 and x100. Each expected price is the screen's
 * own text, so this fails if the price of several levels is ever built another way.
 */
interface Facts {
  discountLabLevels: Record<string, number>
  prices: {
    stat: string
    level: number
    section: string
    multipliers: { multiplier: number, badge: number, shown: string }[]
  }[]
}

const facts = JSON.parse(
  readFileSync(new URL('../../facts/v29.2.3/workshop-buy-multiplier.json', import.meta.url), 'utf8'),
) as Facts

const readings = facts.prices.flatMap(row => row.multipliers.map(reading => ({
  stat: row.stat,
  level: row.level,
  discount: workshopLabLevelToSectionDiscountPercent(facts.discountLabLevels[row.section]),
  ...reading,
})))

const coins = (stat: string, level: number): number =>
  (WORKSHOP_DATA as unknown as Record<string, Record<string, { coins: number }>>)[stat][String(level)].coins

describe('the price the Workshop showed at each buy multiplier', () => {
  it('has all sixty readings', () => {
    expect(readings).toHaveLength(60)
  })

  it.each(readings)('$stat from level $level at x$multiplier shows $shown', ({ stat, level, discount, multiplier, badge, shown }) => {
    const price = computeWorkshopUpgradePrice(stat, level, multiplier, discount)!
    expect(formatGameNumber(price.coins)).toBe(shown)
    expect(price.levels).toBe(badge)
    expect(price.toLevel).toBe(level + badge)
  })
})

describe('how several levels are priced', () => {
  it('discounts each level and then adds, which the low levels can tell apart', () => {
    // Health Regen from level 0 at x5 showed 405. The undiscounted rows sum to 476, and 15% off
    // that is 404.6: the screen cuts decimals, so discounting the total would have shown 404.
    const raw = [0, 1, 2, 3, 4].reduce((sum, level) => sum + coins('Health Regen', level), 0)
    expect(formatGameNumber(raw * 0.85)).toBe('404')
    expect(computeWorkshopUpgradePrice('Health Regen', 0, 5, 15)!.coins).toBe(405)
    expect(computeWorkshopUpgradePrice('Defense Absolute', 0, 5, 15)!.coins).toBe(490)
  })

  it('charges for the row being left, not the one being reached', () => {
    expect(computeWorkshopUpgradePrice('Enemy Attack Level Skip', 0, 1, 0)!.coins).toBe(300_000_000)
    expect(computeWorkshopUpgradePrice('Enemy Attack Level Skip', 0, 1, 15)!.coins).toBe(255_000_000)
  })

  it('sells what is left when the multiplier asks for more', () => {
    expect(computeWorkshopUpgradePrice('Critical Factor', 130, 100, 16)).toMatchObject({ levels: 20, toLevel: 150 })
    expect(computeWorkshopUpgradePrice('Critical Factor', 150, 5, 16)).toMatchObject({ levels: 0, toLevel: 150, coins: 0 })
    // The last level is sold; it is the row before it that carries the price.
    expect(computeWorkshopUpgradePrice('Critical Factor', 149, 1, 0)!.coins).toBe(Math.round(coins('Critical Factor', 149)))
  })

  it('counts one level when no count is given, and no discount when none is', () => {
    expect(computeWorkshopUpgradePrice('Health', 1142)).toEqual(computeWorkshopUpgradePrice('Health', 1142, 1, 0))
  })

  it('is the list price between the same two levels when there is no discount, to the rounding', () => {
    // `workshopCoinCostBetween` sums the rows as stored; this rounds each level to a whole coin,
    // as the screen does, so the two may differ by less than a coin a level and no more.
    for (const [stat, level, count] of [['Health', 1142, 100], ['Enemy Attack Level Skip', 0, 100], ['Damage', 805, 10]] as const) {
      const shown = computeWorkshopUpgradePrice(stat, level, count, 0)!.coins
      const list = workshopCoinCostBetween(stat, level, level + count)!
      expect(Math.abs(shown - list)).toBeLessThan(count / 2 + 1)
    }
  })

  it('refuses what it cannot price', () => {
    expect(computeWorkshopUpgradePrice('Nonsense', 0, 1, 0)).toBeNull()
    expect(computeWorkshopUpgradePrice('constructor', 0, 1, 0)).toBeNull()
    expect(computeWorkshopUpgradePrice('Health', -1, 1, 0)).toBeNull()
    expect(computeWorkshopUpgradePrice('Health', 1.5, 1, 0)).toBeNull()
    expect(computeWorkshopUpgradePrice('Health', 6001, 1, 0)).toBeNull()
    expect(computeWorkshopUpgradePrice('Health', 0, 0, 0)).toBeNull()
  })
})

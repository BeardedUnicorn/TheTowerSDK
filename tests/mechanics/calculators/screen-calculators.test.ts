import { describe, expect, it } from 'vitest'
import { CALCULATORS } from '../../../src/calculators/registry'
import { CalculatorError, runCalculator } from '../../../src/calculators/run'
import { SCREEN_CALCULATORS } from '../../../src/calculators/specs-screens'
import { getNextWorkshopUnlock } from '../../../src/data/workshop/unlocks'
import { computeTotalCoinBonus } from '../../../src/mechanics/coin-bonus/compute'
import { computeLabRushGems } from '../../../src/data/labs/overview'
import { COIN_BONUS_INPUT, SCREEN_CALCULATOR_SAMPLES as SAMPLES } from '../../helpers/screen-calculator-samples'

/*
 * The calculators for numbers the game shows on a screen, run through `runCalculator` exactly as
 * `calc_run` runs them.
 *
 * The registry's own suite (`calculators.test.ts`) checks every curated calculator the same way,
 * but it reads monorepo paths and is skipped in this repository. These are new, so they are held
 * to it here: each runs, gives what the function gives, moves when its input moves, and refuses
 * an argument it does not have.
 */

describe('every screen calculator is declared, curated and sampled', () => {
  it('is in the registry once, with no generated twin', () => {
    for (const spec of SCREEN_CALCULATORS) {
      expect(CALCULATORS.filter(entry => entry.id === spec.id), spec.id).toHaveLength(1)
      expect(spec.tier, spec.id).not.toBe('generated')
    }
  })

  it('has a sample here for each one', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(SCREEN_CALCULATORS.map(spec => spec.id).sort())
  })
})

describe.each(Object.entries(SAMPLES))('%s', (id, { args, moved }) => {
  it('runs, and moves when its input moves', () => {
    const first = runCalculator(id, args).value
    const second = runCalculator(id, moved).value
    expect(first).not.toBeNull()
    expect(second).not.toEqual(first)
  })

  it('refuses an argument it does not have', () => {
    expect(() => runCalculator(id, { ...args, notAParameter: 1 })).toThrow(CalculatorError)
  })
})

describe('what the screen calculators answer', () => {
  it('gives what the shipped function gives', () => {
    expect(runCalculator('coinBonus.total', { input: COIN_BONUS_INPUT }).value)
      .toEqual(computeTotalCoinBonus(COIN_BONUS_INPUT as never))
    expect(runCalculator('workshop.nextUnlock', { category: 'attack', unlocked: 5 }).value)
      .toEqual(getNextWorkshopUnlock('attack', 5))
    expect(runCalculator('lab.rushGems', { remainingHours: 134.678333, maxedLabCount: 19 }).value)
      .toBe(computeLabRushGems(134.678333, 19))
  })

  it('reads the numbers the v29.2.2 screens showed', () => {
    expect(runCalculator('uw.nextUnlockStoneCost', { owned: 6 }).value).toBe(1750)
    expect(runCalculator('lab.rushGems', { remainingHours: 134.678333, maxedLabCount: 19 }).value).toBe(627)
    expect(runCalculator('format.gameNumber', { value: 12_228_041 }).value).toBe('12.22M')
    expect(runCalculator('event.shopPrice', { item: 'relic', rarity: 'Rare' }).value).toEqual({ price: 200, currency: 'medals' })
  })

  it('prices the save at another tier with only the tier rows moving', () => {
    const own = runCalculator('coinBonus.fromSave', { root: { currentTier: 7 } }).value as { bonus: Record<string, number> }
    const other = runCalculator('coinBonus.fromSave', { root: { currentTier: 7 }, tier: 12 }).value as { bonus: Record<string, number> }
    expect(other.bonus.difficultyTier).not.toBe(own.bonus.difficultyTier)
    expect(other.bonus.themes).toBe(own.bonus.themes)
  })

  it('refuses a misspelt option rather than pricing without it', () => {
    expect(() => runCalculator('coinBonus.total', { input: { ...COIN_BONUS_INPUT, relicBonus: 0.2 } }))
      .toThrow(/has no field "relicBonus"/)
  })

  it('accepts a save with no Generator equipped', () => {
    const none = runCalculator('coinBonus.total', { input: { ...COIN_BONUS_INPUT, generator: null } }).value as Record<string, number>
    expect(none.modules).toBe(1)
  })
})

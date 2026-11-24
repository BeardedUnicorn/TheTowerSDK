import { describe, expect, it } from 'vitest'

import { formatCompact, formatGameNumber } from '../../src/formatting'

/*
 * The edges of the game's notation. The readings themselves are pinned in
 * tests/data/live-ui-check-v29-2-2-facts.test.ts; these are the cases a screen happened not to show.
 */
describe('formatGameNumber', () => {
  it('cuts to two decimals where formatCompact rounds', () => {
    expect(formatGameNumber(12_228_041)).toBe('12.22M')
    expect(formatCompact(12_228_041)).toBe('12.23M')
  })

  it('keeps both decimals', () => {
    expect(formatGameNumber(25_200)).toBe('25.20K')
    expect(formatGameNumber(255e6)).toBe('255.00M')
    expect(formatGameNumber(1000)).toBe('1.00K')
  })

  it('never carries into the next notation, because cutting never rounds up', () => {
    expect(formatGameNumber(999_999)).toBe('999.99K')
    expect(formatGameNumber(999_999_999)).toBe('999.99M')
  })

  it('prints a whole number below 1000, rounded', () => {
    expect(formatGameNumber(0)).toBe('0')
    expect(formatGameNumber(25.5)).toBe('26')
    expect(formatGameNumber(778.6)).toBe('779')
    expect(formatGameNumber(999.6)).toBe('1000')
  })

  it('reaches the top of the ladder and falls back past it', () => {
    expect(formatGameNumber(1e33)).toBe('1.00D')
    expect(formatGameNumber(1e36)).toBe('1.00AA')
    expect(formatGameNumber(1e111)).toBe('1.00AZ')
    expect(formatGameNumber(1e115)).toBe('1.00e+115')
  })

  it('keeps the sign and refuses what is not a number', () => {
    expect(formatGameNumber(-12_228_041)).toBe('-12.22M')
    expect(formatGameNumber(Number.NaN)).toBe('0')
    expect(formatGameNumber(Number.POSITIVE_INFINITY)).toBe('0')
  })
})

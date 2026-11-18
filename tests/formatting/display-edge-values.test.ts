import { describe, expect, it } from 'vitest'
import { formatCompact, formatMultiplier, formatTrimmedNumber } from '../../src/formatting/tools/compute'
import { formatNumberForDisplay, formatRateWithNotation } from '../../src/formatting/numbers/compute'

/**
 * Values at the edge of a formatter's range still print as the number they are.
 *
 * Each case here printed a different, well-formed number: 100 as `1`, a zero multiplier as
 * `1.000×`, and 999.9996 as `1,000` on a ladder that never shows a coefficient of 1000. None of
 * them looks like an error, which is why they are pinned.
 */
describe('formatTrimmedNumber', () => {
  it('keeps the zeros of a whole number when no decimals are asked for', () => {
    expect(formatTrimmedNumber(100.3, 0)).toBe('100')
    expect(formatTrimmedNumber(250.4, 0)).toBe('250')
  })

  it('still trims zeros after a decimal point', () => {
    expect(formatTrimmedNumber(1.5)).toBe('1.5')
    expect(formatTrimmedNumber(2.25, 1)).toBe('2.3')
    expect(formatTrimmedNumber(100.3, 1)).toBe('100.3')
  })

  it('never prints a negative zero', () => {
    expect(formatTrimmedNumber(-0.0002)).toBe('0')
  })
})

describe('formatMultiplier', () => {
  it('prints a zero multiplier as zero', () => {
    expect(formatMultiplier(0)).toBe('0.000×')
  })

  it('falls back to 1 only when the value is not a number', () => {
    expect(formatMultiplier(Number.NaN)).toBe('1.000×')
    expect(formatMultiplier(2.5)).toBe('2.500×')
  })
})

describe('a value that rounds up to 1000', () => {
  it('moves to the next notation instead of printing a coefficient of 1000', () => {
    expect(formatCompact(999.9996)).toBe('1K')
    expect(formatNumberForDisplay(999.9996)).toBe('1K')
    expect(formatNumberForDisplay(-999.9996)).toBe('-1K')
  })

  it('leaves values that stay below 1000 alone', () => {
    expect(formatCompact(999)).toBe('999')
    expect(formatCompact(999.5)).toBe('999.5')
  })
})

describe('formatRateWithNotation', () => {
  it('reports 0 when the duration is not a usable number', () => {
    expect(formatRateWithNotation(5000, Number.NaN)).toBe('0')
    expect(formatRateWithNotation(5000, 0)).toBe('0')
  })

  it('still formats a real rate', () => {
    expect(formatRateWithNotation(5000, 2)).toBe('2.5K')
  })
})

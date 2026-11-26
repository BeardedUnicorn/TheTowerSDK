import { describe, expect, it } from 'vitest'

import { runCalculator } from '../../../src/calculators/run'
import { calculatorSpec } from '../../../src/calculators/registry'
import { compactNotationStep } from '../../../src/formatting/numbers/game-notation'
import {
  formatCompact,
  formatHoursDuration,
  formatLargeNumber,
  formatMultiplier,
  formatMultiplierVisualRounded,
  formatTrimmedNumber,
} from '../../../src/formatting/tools/compute'

/**
 * The invariants declared for the presentation helpers, each one run.
 *
 * These thirteen were promoted from the generated tier, where the prose is a placeholder, to the
 * curated one, where it is a claim. A claim nobody ran is the thing the registry exists to
 * prevent, so every line of every `invariants` list in that block has an assertion here.
 *
 * Three of them are caveats: `format.multiplierVisualRounded` and `format.hoursDuration` do not
 * guard `NaN`, and the first prints zero as `-0.00×`. They are pinned as what the functions do
 * today. If one is fixed, its assertion fails and the invariant has to be rewritten with it —
 * which is the point of pinning it.
 *
 * Finite inputs go through `runCalculator`, so the handle and its wiring are under test too.
 * Non-finite ones call the function, because that is what a caller holding a bad number does.
 */
const run = (id: string, args: Record<string, unknown>) => runCalculator(id, args).value

const MULTIPLY = String.fromCharCode(0x00d7)

describe('format.compact', () => {
  it('rounds to two decimals and drops trailing zeros', () => {
    expect(run('format.compact', { n: 12_228_041 })).toBe('12.23M')
    expect(run('format.compact', { n: 25_200 })).toBe('25.2K')
  })

  it('is not the game\'s text', () => {
    expect(run('format.gameNumber', { value: 12_228_041 })).toBe('12.22M')
    expect(run('format.gameNumber', { value: 25_200 })).toBe('25.20K')
  })

  it('returns "0" for NaN and either infinity', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(formatCompact(bad)).toBe('0')
  })
})

describe('format.largeNumber', () => {
  it('is a whole number while the rounded value is within 999 of zero', () => {
    expect(run('format.largeNumber', { value: 999.4 })).toBe('999')
    expect(run('format.largeNumber', { value: -999 })).toBe('-999')
    expect(run('format.largeNumber', { value: 12.4 })).toBe('12')
  })

  it('is compact from there on', () => {
    expect(run('format.largeNumber', { value: 999.6 })).toBe('1K')
    expect(run('format.largeNumber', { value: 12_228_041 })).toBe('12.23M')
  })

  it('returns "0" for NaN and either infinity', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(formatLargeNumber(bad)).toBe('0')
  })
})

describe('format.shard and format.coin', () => {
  it('return exactly what format.compact returns', () => {
    for (const n of [0, 0.12345, 999, 1500, -1500, 25_200, 12_228_041, 1e40]) {
      const compact = run('format.compact', { n })
      expect(run('format.shard', { n }), String(n)).toBe(compact)
      expect(run('format.coin', { n }), String(n)).toBe(compact)
    }
  })
})

describe('format.multiplier', () => {
  it('shows exactly the digits asked for, three by default, then the suffix', () => {
    expect(run('format.multiplier', { m: 1.5 })).toBe(`1.500${MULTIPLY}`)
    expect(run('format.multiplier', { m: 1.5, fractionDigits: 1 })).toBe(`1.5${MULTIPLY}`)
    expect(run('format.multiplier', { m: 2, fractionDigits: 1, suffix: 'x' })).toBe('2.0x')
  })

  it('groups thousands', () => {
    expect(run('format.multiplier', { m: 1234.5678, fractionDigits: 2 })).toBe(`1,234.57${MULTIPLY}`)
  })

  it('prints zero as zero', () => {
    expect(run('format.multiplier', { m: 0 })).toBe(`0.000${MULTIPLY}`)
  })

  it('prints NaN and infinity as 1', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(formatMultiplier(bad)).toBe(`1.000${MULTIPLY}`)
  })
})

describe('format.multiplier3Decimals', () => {
  it('returns exactly what format.multiplier returns at three decimals', () => {
    for (const m of [0, 1, 1.23456, 1234.5678]) {
      expect(run('format.multiplier3Decimals', { m })).toBe(run('format.multiplier', { m, fractionDigits: 3 }))
    }
  })
})

describe('format.moduleMultiplierFractionDigits', () => {
  it('is 3 for a generator and 2 for anything else or nothing', () => {
    expect(run('format.moduleMultiplierFractionDigits', { moduleType: 'generator' })).toBe(3)
    for (const moduleType of ['cannon', 'armor', 'core', 'Generator', '']) {
      expect(run('format.moduleMultiplierFractionDigits', { moduleType }), moduleType).toBe(2)
    }
    expect(run('format.moduleMultiplierFractionDigits', {})).toBe(2)
  })
})

describe('format.multiplierVisualRounded', () => {
  it('rounds up, never down', () => {
    expect(run('format.multiplierVisualRounded', { m: 1.231 })).toBe(`1.24${MULTIPLY}`)
    expect(run('format.multiplierVisualRounded', { m: 1.2301, fractionDigits: 3 })).toBe(`1.231${MULTIPLY}`)
  })

  it('leaves a value already at that precision where it is', () => {
    expect(run('format.multiplierVisualRounded', { m: 1.23 })).toBe(`1.23${MULTIPLY}`)
  })

  it('does not guard its input', () => {
    expect(formatMultiplierVisualRounded(Number.NaN)).toBe(`NaN${MULTIPLY}`)
    expect(run('format.multiplierVisualRounded', { m: 0 })).toBe(`-0.00${MULTIPLY}`)
  })
})

describe('format.moduleMultiplierVisualRounded', () => {
  it('uses three decimals for a generator and two otherwise, rounding up', () => {
    expect(run('format.moduleMultiplierVisualRounded', { m: 1.2301, moduleType: 'generator' })).toBe(`1.231${MULTIPLY}`)
    expect(run('format.moduleMultiplierVisualRounded', { m: 1.2301, moduleType: 'cannon' })).toBe(`1.24${MULTIPLY}`)
    expect(run('format.moduleMultiplierVisualRounded', { m: 1.2301 })).toBe(`1.24${MULTIPLY}`)
  })
})

describe('format.hoursDuration', () => {
  it('always ends in seconds and omits leading zero units', () => {
    expect(run('format.hoursDuration', { hours: 1 })).toBe('1h 0m 0s')
    expect(run('format.hoursDuration', { hours: 24 })).toBe('1d 0h 0m 0s')
    expect(run('format.hoursDuration', { hours: 25.5 })).toBe('1d 1h 30m 0s')
    expect(run('format.hoursDuration', { hours: 0.01 })).toBe('36s')
  })

  it('rounds to the nearest second', () => {
    expect(run('format.hoursDuration', { hours: 1.4 / 3600 })).toBe('1s')
    expect(run('format.hoursDuration', { hours: 1.6 / 3600 })).toBe('2s')
  })

  it('prints zero and negative hours as 0s', () => {
    expect(run('format.hoursDuration', { hours: 0 })).toBe('0s')
    expect(run('format.hoursDuration', { hours: -2 })).toBe('0s')
  })

  it('does not guard its input', () => {
    expect(formatHoursDuration(Number.NaN)).toBe('NaNs')
  })
})

describe('format.trimmedNumber', () => {
  it('returns the fallback for NaN and either infinity', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(formatTrimmedNumber(bad)).toBe('-')
      expect(formatTrimmedNumber(bad, 3, 'n/a')).toBe('n/a')
    }
  })

  it('prints a value within 0.0001 of a whole number as that number', () => {
    expect(run('format.trimmedNumber', { value: 2.00001 })).toBe('2')
    expect(run('format.trimmedNumber', { value: 1.5 })).toBe('1.5')
    expect(run('format.trimmedNumber', { value: 1.23456, maxDecimals: 2 })).toBe('1.23')
  })

  it('never prints -0', () => {
    for (const value of [-0, -0.00001, -0.0002, -0.0004]) {
      expect(run('format.trimmedNumber', { value }), String(value)).toBe('0')
    }
  })

  it('keeps 100 as 100 with no decimals', () => {
    expect(run('format.trimmedNumber', { value: 100, maxDecimals: 0 })).toBe('100')
  })
})

describe('notation.compactStep', () => {
  it('starts at 1000 and multiplies by 1000 a tier', () => {
    expect(run('notation.compactStep', { tier: 0 })).toBe(1000)
    expect(run('notation.compactStep', { tier: 1 })).toBe(1_000_000)
    expect(run('notation.compactStep', { tier: 10 })).toBe(1e33)
  })

  it('equals the decimal literal exactly', () => {
    expect(compactNotationStep(11)).toBe(1e36)
    expect(compactNotationStep(36)).toBe(1e111)
    for (let tier = 0; tier <= 36; tier += 1) {
      expect(compactNotationStep(tier), String(tier)).toBe(Number(`1e${3 * (tier + 1)}`))
    }
  })
})

describe('notation.normalizeDecimalSeparatorsDeep', () => {
  const input = {
    coins: '1,5q',
    thousands: '1,500',
    date: ' 2026-08-19 ',
    startTime: ' 1,5 ',
    nested: { values: ['2,5K', 3, null] },
    count: 4,
  }
  const before = JSON.stringify(input)
  const output = run('notation.normalizeDecimalSeparatorsDeep', { data: input }) as typeof input

  it('turns a comma between digits into a period, at every depth', () => {
    expect(output.coins).toBe('1.5q')
    expect(output.nested.values[0]).toBe('2.5K')
  })

  it('does the same to a thousands comma', () => {
    expect(output.thousands).toBe('1.500')
  })

  it('only trims a string under a date or time key', () => {
    expect(output.date).toBe('2026-08-19')
    expect(output.startTime).toBe('1,5')
  })

  it('passes numbers and null through, and leaves the input alone', () => {
    expect(output.count).toBe(4)
    expect(output.nested.values.slice(1)).toEqual([3, null])
    expect(JSON.stringify(input)).toBe(before)
    expect(output).not.toBe(input)
  })
})

describe('the declarations these assertions back', () => {
  it('are curated, and say what was checked', () => {
    const ids = [
      'format.compact', 'format.largeNumber', 'format.shard', 'format.coin', 'format.multiplier',
      'format.multiplier3Decimals', 'format.moduleMultiplierFractionDigits',
      'format.multiplierVisualRounded', 'format.moduleMultiplierVisualRounded',
      'format.hoursDuration', 'format.trimmedNumber', 'notation.compactStep',
      'notation.normalizeDecimalSeparatorsDeep',
    ]
    for (const id of ids) {
      const spec = calculatorSpec(id)
      expect(spec, id).toBeDefined()
      expect(spec?.tier, id).not.toBe('generated')
      expect(spec?.because, id).not.toContain('not yet written')
    }
  })

  it('no longer answer to the generated handles', () => {
    expect(() => runCalculator('formatting.formatCompact', { n: 1 })).toThrow()
  })
})

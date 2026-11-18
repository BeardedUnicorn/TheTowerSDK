import { describe, expect, it } from 'vitest'
import { buildAveragedImportRunSummary, normalizeBattleRunCompactForDedup } from '../../src/save/battle/reports'

/**
 * A compact number read back from a run record keeps the magnitude it was written with.
 *
 * The game's ladder distinguishes `q` (1e15) from `Q` (1e18) and `s` from `S` by case, and runs on
 * through O, N, D and AA to AZ. The reader lowercased its input and knew five suffixes, so an
 * endgame run's `2.5Q` coins averaged to `2.5q` -- a thousand times too few -- and anything from
 * `s` upward became 0. Those are the same strings the package writes into a run record itself.
 */
describe('compact numbers in battle run records', () => {
  it('does not fold Q into q', () => {
    expect(normalizeBattleRunCompactForDedup('1.5Q')).toBe('1.5Q')
    expect(normalizeBattleRunCompactForDedup('1.5q')).toBe('1.5q')
  })

  it('reads suffixes past q', () => {
    expect(normalizeBattleRunCompactForDedup('3S')).toBe('3S')
    expect(normalizeBattleRunCompactForDedup('1.2s')).toBe('1.2s')
    expect(normalizeBattleRunCompactForDedup('4D')).toBe('4D')
    expect(normalizeBattleRunCompactForDedup('7AA')).toBe('7AA')
  })

  it('still reads the small suffixes in either case', () => {
    expect(normalizeBattleRunCompactForDedup('12k')).toBe('12K')
    expect(normalizeBattleRunCompactForDedup('3.4m')).toBe('3.4M')
    expect(normalizeBattleRunCompactForDedup('250')).toBe('250')
  })

  it('averages endgame runs at their real magnitude', () => {
    const summary = buildAveragedImportRunSummary([
      { coins: '2Q', cells: '1s' },
      { coins: '4Q', cells: '3s' },
    ])
    expect(summary.coins).toBe('3Q')
    expect(summary.cells).toBe('2s')
  })
})

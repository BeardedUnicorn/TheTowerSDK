import { describe, expect, it } from 'vitest'
import { waveSkipExpectedSkipsPerProc } from '../../src/mechanics/enemies/drops-simulation'
import {
  waveSkipChainIncomeFactor,
  waveSkipIncomeEv,
  waveSkipSpawnFraction,
} from '../../src/mechanics/resource-drops/wave-skip-per-wave'

describe('wave-skip-per-wave', () => {
  it('spawn fraction is 1 when skip chance is zero', () => {
    expect(waveSkipSpawnFraction(0, waveSkipExpectedSkipsPerProc(9))).toBe(1)
  })

  /*
   * A 17% Wave Skip card with no mastery, which skips 1.235 waves a proc on average: for every
   * played wave 0.17 x 1.235 = 0.21 are skipped, so 17.4% of all waves spawn nothing. One
   * account's runs with that card skipped 15,598 of 78,771 waves, 19.8%.
   */
  it('counts every skipped wave as spawning nothing, the first of a chain included', () => {
    const played = waveSkipSpawnFraction(0.17, waveSkipExpectedSkipsPerProc(0))
    expect(played).toBeCloseTo(1 / (1 + 0.17 * 1.235), 12)
    expect(1 - played).toBeCloseTo(0.1735, 3)
    expect(Math.abs((1 - played) - 15_598 / 78_771)).toBeLessThan(0.03)
    // Counting only the skips beyond the first left 3.8% of waves skipped, a fifth of the records.
    expect(1 - played).toBeGreaterThan(4 * (1 - 1 / (1 + 0.17 * 0.235)))
    // One skip a proc is still a skipped wave.
    expect(waveSkipSpawnFraction(0.2, 1)).toBeCloseTo(1 / 1.2, 12)
    expect(waveSkipSpawnFraction(0.2, 0)).toBe(1)
  })

  it('spawn fraction drops when expected skips per proc rises', () => {
    const shallow = waveSkipSpawnFraction(0.19, waveSkipExpectedSkipsPerProc(0))
    const deep = waveSkipSpawnFraction(0.19, waveSkipExpectedSkipsPerProc(9))
    expect(deep).toBeLessThan(shallow)
    expect(deep).toBeGreaterThan(0)
    expect(deep).toBeLessThan(1)
  })

  it('chain income factor exceeds single 1.1 when extra skips exist', () => {
    expect(waveSkipChainIncomeFactor(1)).toBe(0)
    expect(waveSkipChainIncomeFactor(2)).toBeCloseTo(1.1, 6)
    expect(waveSkipChainIncomeFactor(waveSkipExpectedSkipsPerProc(9))).toBeGreaterThan(1.1)
  })

  it('wave skip income EV exceeds linear-only at high mastery depth', () => {
    const prevTotal = 1000
    const anchor = 800
    const skipChance = 0.19
    const expectedSkips = waveSkipExpectedSkipsPerProc(9)
    const spawnFraction = waveSkipSpawnFraction(skipChance, expectedSkips)
    const compound = waveSkipIncomeEv(prevTotal, anchor, skipChance, expectedSkips, spawnFraction)
    const linearOnly = (1 - spawnFraction) * 1.1 * prevTotal
    expect(compound).toBeGreaterThan(linearOnly)
  })

  it('returns zero skip income when spawn fraction is 1', () => {
    expect(waveSkipIncomeEv(1000, 800, 0, 2.85, 1)).toBe(0)
  })
})

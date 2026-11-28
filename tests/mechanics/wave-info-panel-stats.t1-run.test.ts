import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/mechanics/wave-info-panel-t1-readings.fixtures.json'
import tier7 from '../../fixtures/mechanics/wave-info-panel-t7-readings.fixtures.json'
import { bossWaveIntervalForTier } from '../../src/data/enemies/data'
import { eliteSpawnChanceAtWave, isBossSpawnWave } from '../../src/mechanics/enemies/elite-spawn-chance'
import type { EnemyWaveEnemyType } from '../../src/mechanics/enemies/types'
import {
  enemySpawnRateCap,
  waveInfoEnemyMass,
  waveInfoEnemySpeed,
  waveInfoSpawnChances,
} from '../../src/mechanics/waves/info-panel-stats'
import { newWaveProtectorChanceV29 } from '../../src/mechanics/waves/new-wave-spawn-type-chances'
import { computeWaveBaseDamage, computeWaveBaseHealthRaw } from '../../src/mechanics/waves/reference/base-scaling-legacy'

/**
 * The game's own Wave Info panel, read at (almost) every wave of Tier 1 from 1 to 2368, against
 * what the SDK returns for the same tier and wave. The companion of the Tier 7 file, with the same
 * two kinds of test:
 *
 * - `it(...)` pins something the SDK reproduces at every reading. A failure is a regression.
 * - `it.fails(...)` records something the SDK does NOT reproduce. Each is a measured gap, kept so
 *   that fixing the formula turns the test red and forces this file to be updated. Do not "fix" one
 *   by loosening the expectation — the fixture is the game's output.
 *
 * The fixture holds only what the panel displayed. The table of states below is the fixture
 * restated, so a change to the fixture cannot pass unnoticed; it is not a formula.
 */

const TIER = fixture.provenance.tier
const READINGS = fixture.readings
const MASTERY = fixture.account.waveAcceleratorMastery

const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15 }

/** "21.35B" → the mantissa in hundredths (2135) and the unit (1e9); "965.88" has unit 1. */
function parsePanelNumber(text: string): { hundredths: number, unit: number } {
  const match = /^(\d+)\.(\d{2})([KMBTq]?)$/.exec(text)
  if (!match) throw new Error(`unreadable panel number: ${text}`)
  const unit = match[3] ? SUFFIX[match[3]] : 1
  if (!unit) throw new Error(`unknown suffix in: ${text}`)
  return { hundredths: Number(match[1]) * 100 + Number(match[2]), unit }
}

/** The panel cuts to two decimals; it does not round. */
function asPanelHundredths(value: number, unit: number): number {
  return Math.floor(value / (unit / 100))
}

/**
 * Every state the panel showed, by the first wave it appeared at: Basic / Fast / Tank / Ranged
 * chance and the spawn rate. Each holds until the next row.
 */
const STATES: ReadonlyArray<readonly [fromWave: number, basic: number, fast: number, tank: number, ranged: number, spawnRate: number]> = [
  [1, 95, 5, 0, 0, 10],
  [3, 93, 5, 2, 0, 11],
  [6, 90, 6, 4, 0, 13],
  [20, 87, 7, 6, 0, 15],
  [21, 85, 7, 6, 2, 15],
  [40, 82, 8, 7, 3, 17],
  [60, 79, 9, 8, 4, 19],
  [80, 76, 10, 9, 5, 20],
  [100, 74, 10, 10, 6, 22],
  [150, 72, 11, 11, 6, 24],
  [160, 71, 11, 12, 6, 24],
  [200, 69, 11, 13, 7, 26],
  [250, 67, 12, 14, 7, 28],
  [300, 65, 12, 15, 8, 30],
  [320, 64, 12, 16, 8, 30],
  [400, 62, 13, 16, 9, 32],
  [600, 60, 13, 17, 10, 34],
  [750, 59, 13, 18, 10, 34],
  [800, 58, 13, 18, 11, 36],
  [1000, 56, 14, 19, 11, 37],
  [1250, 54, 15, 20, 11, 38],
  [1500, 52, 15, 20, 13, 39],
  [2000, 48, 17, 21, 14, 40],
]

function stateAt(wave: number) {
  let state = STATES[0]!
  for (const row of STATES) if (row[0] <= wave) state = row
  return state
}

describe('Wave Info panel, Tier 1 runs — the fixture itself', () => {
  it('holds one reading per wave, in order, with ordinary chances that sum to 100', () => {
    expect(READINGS.length).toBe(2339)
    expect(READINGS[0]!.wave).toBe(1)
    expect(READINGS.at(-1)!.wave).toBe(2368)
    const seen = new Set<number>()
    for (let i = 0; i < READINGS.length; i += 1) {
      const r = READINGS[i]!
      if (i > 0) expect(r.wave, `reading ${i}`).toBeGreaterThan(READINGS[i - 1]!.wave)
      seen.add(r.wave)
      const c = r.chance
      expect(c.Basic + c.Fast + c.Tank + c.Ranged + c.Protector, `wave ${r.wave}`).toBe(100)
    }
    const missing: number[] = []
    for (let wave = 1; wave <= 2368; wave += 1) if (!seen.has(wave)) missing.push(wave)
    expect(missing).toEqual(fixture.missingWaves)
  })

  it('shows 23 states, each starting at the wave listed', () => {
    for (const r of READINGS) {
      const [, basic, fast, tank, ranged, spawnRate] = stateAt(r.wave)
      expect(
        { ...r.chance, spawnRate: r.spawnRate },
        `wave ${r.wave}`,
      ).toEqual({ Basic: basic, Fast: fast, Tank: tank, Ranged: ranged, Protector: 0, spawnRate })
    }
    // Every state's first wave was itself read, except wave 1500 (its Ranged cell did not read).
    const waves = new Set(READINGS.map(r => r.wave))
    expect(STATES.map(row => row[0]).filter(wave => !waves.has(wave))).toEqual([1500])
  })

  it('agrees with the Tier 7 run at the same wave, with Protector taken out of Tank', () => {
    const byWave = new Map(READINGS.map(r => [r.wave, r]))
    let compared = 0
    for (const seven of tier7.readings) {
      const one = byWave.get(seven.wave)
      if (!one) continue
      compared += 1
      expect(
        { Basic: one.chance.Basic, Fast: one.chance.Fast, Ranged: one.chance.Ranged, Tank: one.chance.Tank, spawnRate: one.spawnRate },
        `wave ${seven.wave}`,
      ).toEqual({
        Basic: seven.chance.Basic,
        Fast: seven.chance.Fast,
        Ranged: seven.chance.Ranged,
        Tank: seven.chance.Tank + seven.chance.Protector,
        spawnRate: seven.spawnRate,
      })
      expect(Math.abs(one.basicSpeed - seven.basicSpeed), `speed at wave ${seven.wave}`).toBeLessThan(0.015)
    }
    expect(compared).toBeGreaterThan(30)
  })

  it('shows the Boss row change at wave 1500 of this run', () => {
    // Health 20x Basic to about 5.93x and speed up by half: taken to be the Boss trade-off perk
    // (health -70%, speed +50%), picked in this run around wave 1500. Not a property of the wave.
    for (const r of READINGS) {
      const basic = parsePanelNumber(r.basicHealth)
      const boss = parsePanelNumber(r.bossHealth)
      const ratio = (boss.hundredths * boss.unit) / (basic.hundredths * basic.unit)
      if (r.wave < 1500) {
        expect(Math.abs(ratio / 20 - 1), `wave ${r.wave}`).toBeLessThan(0.01)
        expect(r.bossSpeed, `wave ${r.wave}`).toBe(r.protectorSpeed)
      } else {
        expect(Math.abs(ratio / 5.93 - 1), `wave ${r.wave}`).toBeLessThan(0.01)
        expect(r.bossSpeed, `wave ${r.wave}`).toBe(r.tankSpeed)
      }
    }
  })
})

describe('Wave Info panel, Tier 1 runs — what the SDK reproduces', () => {
  it('Basic health is the base at the wave less the health skips', () => {
    // Two readings sit one hundredth below the SDK, where the SDK value lands on the boundary
    // (965.8900469 shown as 965.88; 87.4000002B shown as 87.39B).
    const oneBelow: number[] = []
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicHealth)
      const sdk = computeWaveBaseHealthRaw({ tier: TIER, wave: r.wave - r.healthSkips })
      const difference = asPanelHundredths(sdk, panel.unit) - panel.hundredths
      if (difference === 1) oneBelow.push(r.wave)
      else expect(difference, `wave ${r.wave}`).toBe(0)
    }
    expect(oneBelow).toEqual([65, 1767])
  })

  it('Basic attack is the base at the wave less the attack skips', () => {
    // The SDK returns a whole number, so below 1,000 only the whole part can be compared. Five
    // readings sit one hundredth below the SDK, each where the SDK value is exactly on the boundary
    // (278,280 shown as 278.27K).
    const oneBelow: number[] = []
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicAttack)
      const sdk = computeWaveBaseDamage({ tier: TIER, wave: r.wave - r.attackSkips })
      if (panel.unit === 1) {
        expect(sdk, `wave ${r.wave}`).toBe(Math.floor(panel.hundredths / 100))
        continue
      }
      const difference = asPanelHundredths(sdk, panel.unit) - panel.hundredths
      if (difference === 1) oneBelow.push(r.wave)
      else expect(difference, `wave ${r.wave}`).toBe(0)
    }
    expect(oneBelow).toEqual([919, 939, 940, 1200, 1262])
  })

  it('elite chance per row is a third of the chart value, across four chart thresholds', () => {
    const totals = new Set<number>()
    for (const r of READINGS) {
      const total = eliteSpawnChanceAtWave(TIER, r.wave).singleSpawnPct
      totals.add(total)
      expect(Math.floor(total / 3), `wave ${r.wave}`).toBe(Math.floor(r.eliteEach))
    }
    // 0% to wave 499, 1% from 500, 4% from 1000, 9% from 1500, 16% from 2000.
    expect([...totals].sort((a, b) => a - b)).toEqual([0, 1, 4, 9, 16])
  })

  it('Protector chance follows the wave-initialization formula (none on Tier 1)', () => {
    for (const r of READINGS) {
      expect(newWaveProtectorChanceV29(TIER, r.wave), `wave ${r.wave}`).toBe(r.chance.Protector)
    }
  })

  it('Boss chance is 100 on a boss wave and 0 otherwise', () => {
    const interval = bossWaveIntervalForTier(TIER)
    for (const r of READINGS) {
      expect(isBossSpawnWave(r.wave, interval) ? 100 : 0, `wave ${r.wave}`).toBe(r.boss)
    }
  })

  it('spawn rate matches the Wave Accelerator chart from wave 1000 to 1249 and from 1500 up', () => {
    const charted = READINGS.filter(r => (r.wave >= 1000 && r.wave < 1250) || r.wave >= 1500)
    expect(new Set(charted.map(r => r.spawnRate))).toEqual(new Set([37, 39, 40]))
    for (const r of charted) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })
})

describe('Wave Info panel, Tier 1 runs — measured gaps', () => {
  it.fails('ordinary spawn chances match the panel', () => {
    // No reading matches: the SDK's Basic chance differs from the panel's at every wave.
    for (const r of READINGS) {
      const sdk = waveInfoSpawnChances(TIER, r.wave)
      expect({ Basic: sdk.Basic, Fast: sdk.Fast, Tank: sdk.Tank, Ranged: sdk.Ranged }, `wave ${r.wave}`).toEqual({
        Basic: r.chance.Basic,
        Fast: r.chance.Fast,
        Tank: r.chance.Tank,
        Ranged: r.chance.Ranged,
      })
    }
  })

  it.fails('Basic speed matches the panel', () => {
    // Panel 1.01 at wave 6 and 2.64 at wave 2368; SDK 1.00 and 2.51. The panel's speed steps up at
    // the same waves as the chances; the SDK's does not.
    for (const r of READINGS) {
      const sdk = waveInfoEnemySpeed({ tier: TIER, wave: r.wave, enemyType: 'Basic' })
      expect(Math.abs(sdk - r.basicSpeed), `wave ${r.wave}`).toBeLessThan(0.01)
    }
  })

  it.fails('mass matches the panel', () => {
    const wave = READINGS[0]!.wave
    for (const [enemyType, panel] of Object.entries(fixture.mass)) {
      if (typeof panel !== 'number') continue
      const sdk = waveInfoEnemyMass({ tier: TIER, wave, enemyType: enemyType as EnemyWaveEnemyType })
      expect(Math.abs(sdk - panel), enemyType).toBeLessThan(0.01)
    }
  })

  it.fails('spawn rate matches the panel below wave 1000', () => {
    // Panel 10 at wave 1; the SDK ramps linearly below the first chart row and returns 1.
    const early = READINGS.filter(r => r.wave < 1000)
    expect(early.length).toBeGreaterThan(900)
    for (const r of early) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })

  it.fails('spawn rate matches the panel between waves 1250 and 1500', () => {
    // Panel 38 from wave 1250 to 1499. The chart goes from 37 (wave 1000) straight to 39 (wave
    // 1500); it has no row for 38.
    const mid = READINGS.filter(r => r.wave >= 1250 && r.wave < 1500)
    expect(mid.length).toBeGreaterThan(200)
    for (const r of mid) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })
})

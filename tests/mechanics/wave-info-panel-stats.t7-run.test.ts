import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/mechanics/wave-info-panel-t7-readings.fixtures.json'
import { bossWaveIntervalForTier } from '../../src/data/enemies/data'
import { eliteSpawnChanceAtWave, isBossSpawnWave } from '../../src/mechanics/enemies/elite-spawn-chance'
import type { EnemyWaveEnemyType } from '../../src/mechanics/enemies/types'
import { getBasicEnemyWaveStats } from '../../src/mechanics/enemies/wave-stats'
import {
  enemySpawnRateCap,
  waveInfoEnemyMass,
  waveInfoEnemySpeed,
  waveInfoSpawnChances,
} from '../../src/mechanics/waves/info-panel-stats'
import { newWaveProtectorChanceV29 } from '../../src/mechanics/waves/new-wave-spawn-type-chances'

/**
 * The game's own Wave Info panel, read across one Tier 7 run (waves 701 to 2504), against what the
 * SDK returns for the same tier and wave.
 *
 * Two kinds of test live here, and the difference matters:
 *
 * - `it(...)` pins something the SDK reproduces at every reading. A failure is a regression.
 * - `it.fails(...)` records something the SDK does NOT reproduce. Each is a measured gap, kept so
 *   that fixing the formula turns the test red and forces this file to be updated. Do not "fix" one
 *   by loosening the expectation — the fixture is the game's output.
 *
 * The fixture holds only what the panel displayed. Nothing here recomputes a formula; every
 * expectation is a panel value and every actual is an SDK export.
 */

const TIER = fixture.provenance.tier
const READINGS = fixture.readings
const MASTERY = fixture.account.waveAcceleratorMastery

const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15 }

/** "21.35B" → the mantissa in hundredths (2135) and the unit (1e9), as the panel wrote them. */
function parsePanelNumber(text: string): { hundredths: number, unit: number } {
  const match = /^(\d+)\.(\d{2})([KMBTq])$/.exec(text)
  if (!match) throw new Error(`unreadable panel number: ${text}`)
  const unit = SUFFIX[match[3]!]
  if (!unit) throw new Error(`unknown suffix in: ${text}`)
  return { hundredths: Number(match[1]) * 100 + Number(match[2]), unit }
}

/** The panel cuts to two decimals; it does not round (21,356,192,393 shows as 21.35B). */
function asPanelHundredths(value: number, unit: number): number {
  return Math.floor(value / (unit / 100))
}

describe('Wave Info panel, Tier 7 run — the fixture itself', () => {
  it('holds readings in wave order with ordinary chances that sum to 100', () => {
    expect(READINGS.length).toBe(39)
    for (let i = 0; i < READINGS.length; i += 1) {
      const r = READINGS[i]!
      if (i > 0) expect(r.wave, `reading ${i}`).toBeGreaterThan(READINGS[i - 1]!.wave)
      const c = r.chance
      expect(c.Basic + c.Fast + c.Tank + c.Ranged + c.Protector, `wave ${r.wave}`).toBe(100)
    }
  })
})

describe('Wave Info panel, Tier 7 run — what the SDK reproduces', () => {
  it('Basic health is the base at the wave less the health skips', () => {
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicHealth)
      const sdk = getBasicEnemyWaveStats(TIER, r.wave - r.healthSkips).hp
      expect(asPanelHundredths(sdk, panel.unit), `wave ${r.wave}`).toBe(panel.hundredths)
    }
  })

  it('Basic attack is the base at the wave less the attack skips', () => {
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicAttack)
      const sdk = getBasicEnemyWaveStats(TIER, r.wave - r.attackSkips).damage
      expect(asPanelHundredths(sdk, panel.unit), `wave ${r.wave}`).toBe(panel.hundredths)
    }
  })

  it('elite chance per row is a third of the chart value, across four chart thresholds', () => {
    const totals = new Set<number>()
    for (const r of READINGS) {
      const total = eliteSpawnChanceAtWave(TIER, r.wave).singleSpawnPct
      totals.add(total)
      expect(Math.floor(total / 3), `wave ${r.wave}`).toBe(Math.floor(r.eliteEach))
    }
    // 4% at 701, 9% from 797, 16% from 1063, 25% from 1594, 36% from 2126.
    expect([...totals].sort((a, b) => a - b)).toEqual([4, 9, 16, 25, 36])
  })

  it('Protector chance follows the wave-initialization formula', () => {
    for (const r of READINGS) {
      expect(newWaveProtectorChanceV29(TIER, r.wave), `wave ${r.wave}`).toBe(r.chance.Protector)
    }
  })

  it('Boss chance is 100 on a boss wave and 0 otherwise', () => {
    const interval = bossWaveIntervalForTier(TIER)
    expect(READINGS.some(r => r.boss === 100)).toBe(true)
    for (const r of READINGS) {
      expect(isBossSpawnWave(r.wave, interval) ? 100 : 0, `wave ${r.wave}`).toBe(r.boss)
    }
  })

  it('spawn rate matches the Wave Accelerator chart from wave 1500 up', () => {
    // Three chart rows are exercised: 39 from wave 1500, 40 from wave 2000 and 42 from wave 2500.
    const charted = READINGS.filter(r => r.wave >= 1500)
    expect(new Set(charted.map(r => r.spawnRate))).toEqual(new Set([39, 40, 42]))
    for (const r of charted) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })
})

describe('Wave Info panel, Tier 7 run — measured gaps', () => {
  it.fails('ordinary spawn chances match the panel', () => {
    // Panel at wave 701: Basic 60 / Fast 13 / Tank 14 / Ranged 10. SDK: 84 / 4 / 4 / 4.
    // The panel's Fast, Tank and Ranged also rise with wave; the SDK's depend on tier alone.
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

  it.fails('the Protector chance inside waveInfoSpawnChances matches the panel', () => {
    // It disagrees with newWaveProtectorChanceV29, which is the one the panel agrees with.
    for (const r of READINGS) {
      expect(waveInfoSpawnChances(TIER, r.wave).Protector, `wave ${r.wave}`).toBe(r.chance.Protector)
    }
  })

  it.fails('Basic speed matches the panel', () => {
    // Panel 1.49 at wave 701 and 2.12 at wave 1505; SDK 2.19 and 2.63. The ratio drifts, so this
    // is not one missing multiplier, and the account has no enemy-stat labs.
    for (const r of READINGS) {
      const sdk = waveInfoEnemySpeed({ tier: TIER, wave: r.wave, enemyType: 'Basic' })
      expect(Math.abs(sdk - r.basicSpeed), `wave ${r.wave}`).toBeLessThan(0.01)
    }
  })

  it.fails('mass matches the panel', () => {
    // Panel Basic 1.05; SDK 21.152.
    const wave = READINGS[0]!.wave
    for (const [enemyType, panel] of Object.entries(fixture.mass)) {
      if (typeof panel !== 'number') continue
      const sdk = waveInfoEnemyMass({ tier: TIER, wave, enemyType: enemyType as EnemyWaveEnemyType })
      expect(Math.abs(sdk - panel), enemyType).toBeLessThan(0.01)
    }
  })

  it.fails('spawn rate matches the panel below wave 1000', () => {
    // Panel 34 at wave 701 and 36 at wave 833; the SDK ramps linearly below the first chart row.
    const early = READINGS.filter(r => r.wave < 1000)
    expect(early.length).toBe(2)
    for (const r of early) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })

  it.fails('spawn rate matches the panel between waves 1250 and 1500', () => {
    // Panel 38 at waves 1287 to 1401. The chart goes from 37 (wave 1000) straight to 39 (wave
    // 1500); it has no row for 38.
    const mid = READINGS.filter(r => r.wave >= 1250 && r.wave < 1500)
    expect(mid.length).toBe(4)
    for (const r of mid) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })
})

import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/mechanics/wave-info-panel-t12-readings.fixtures.json'
import tier1 from '../../fixtures/mechanics/wave-info-panel-t1-readings.fixtures.json'
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
 * The game's own Wave Info panel, read at every wave of one Tier 12 run from 1 to 180, against what
 * the SDK returns for the same tier and wave, and against the Tier 1 readings at the same wave. The
 * companion of the Tier 1 and Tier 7 files, with the same two kinds of test:
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
const TIER_1 = new Map(tier1.readings.map(r => [r.wave, r]))

const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15 }

/** "21.35B" → the mantissa in hundredths (2135) and the unit (1e9). */
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
 * Every state the panel showed, by the first wave it appeared at: Basic / Fast / Tank / Ranged /
 * Protector chance and the spawn rate. Each holds until the next row.
 */
const STATES: ReadonlyArray<
  readonly [fromWave: number, basic: number, fast: number, tank: number, ranged: number, protector: number, spawnRate: number]
> = [
  [1, 94, 5, 0, 0, 1, 10],
  [3, 92, 5, 2, 0, 1, 11],
  [6, 88, 6, 4, 1, 1, 13],
  [20, 84, 7, 6, 2, 1, 15],
  [40, 81, 8, 7, 3, 1, 17],
  [60, 78, 9, 8, 4, 1, 19],
  [80, 75, 10, 8, 5, 2, 20],
  [100, 73, 10, 9, 6, 2, 22],
  [150, 71, 11, 10, 6, 2, 24],
  [160, 70, 11, 10, 6, 3, 24],
]

function stateAt(wave: number) {
  let state = STATES[0]!
  for (const row of STATES) if (row[0] <= wave) state = row
  return state
}

describe('Wave Info panel, Tier 12 run — the fixture itself', () => {
  it('holds one reading for every wave from 1 to 180, with ordinary chances that sum to 100', () => {
    expect(READINGS.length).toBe(180)
    expect(fixture.missingWaves).toEqual([])
    for (let i = 0; i < READINGS.length; i += 1) {
      const r = READINGS[i]!
      expect(r.wave, `reading ${i}`).toBe(i + 1)
      const c = r.chance
      expect(c.Basic + c.Fast + c.Tank + c.Ranged + c.Protector, `wave ${r.wave}`).toBe(100)
    }
  })

  it('shows 10 states, each starting at the wave listed', () => {
    for (const r of READINGS) {
      const [, basic, fast, tank, ranged, protector, spawnRate] = stateAt(r.wave)
      expect(
        { ...r.chance, spawnRate: r.spawnRate },
        `wave ${r.wave}`,
      ).toEqual({ Basic: basic, Fast: fast, Tank: tank, Ranged: ranged, Protector: protector, spawnRate })
    }
  })

  it('shows no trade-off perk: Boss health is 20 times Basic and Boss speed is the Protector\'s', () => {
    for (const r of READINGS) {
      const basic = parsePanelNumber(r.basicHealth)
      const boss = parsePanelNumber(r.bossHealth)
      const ratio = (boss.hundredths * boss.unit) / (basic.hundredths * basic.unit)
      expect(Math.abs(ratio / 20 - 1), `wave ${r.wave}`).toBeLessThan(0.01)
      expect(r.bossSpeed, `wave ${r.wave}`).toBe(r.protectorSpeed)
    }
  })
})

describe('Wave Info panel, Tier 12 run — against Tier 1 at the same wave', () => {
  it('has the same Fast chance and the same spawn rate', () => {
    let compared = 0
    for (const r of READINGS) {
      const one = TIER_1.get(r.wave)
      if (!one) continue
      compared += 1
      expect({ Fast: r.chance.Fast, spawnRate: r.spawnRate }, `wave ${r.wave}`).toEqual({
        Fast: one.chance.Fast,
        spawnRate: one.spawnRate,
      })
    }
    expect(compared).toBeGreaterThan(170)
  })

  it('has Tier 1\'s Tank less the Protector band count, and a Protector chance one above that count', () => {
    // Tier 1 has no Protector row: its Tank absorbs one point at wave 80 and a second at wave 160.
    // Tier 12 keeps Tank without them and shows Protector at that count plus 1.
    for (const r of READINGS) {
      const one = TIER_1.get(r.wave)
      if (!one) continue
      const bands = r.wave >= 160 ? 2 : r.wave >= 80 ? 1 : 0
      expect(r.chance.Tank, `wave ${r.wave}`).toBe(one.chance.Tank - bands)
      expect(r.chance.Protector, `wave ${r.wave}`).toBe(bands + 1)
    }
  })

  it('has Ranged earlier than Tier 1 below wave 40 and equal from there', () => {
    // Tier 12: 1% from wave 6 and 2% from wave 20. Tier 1: none to wave 20, 2% from wave 21.
    for (const r of READINGS) {
      const one = TIER_1.get(r.wave)
      if (!one) continue
      const ahead = r.wave >= 6 && r.wave < 20 ? 1 : r.wave === 20 ? 2 : 0
      expect(r.chance.Ranged - one.chance.Ranged, `wave ${r.wave}`).toBe(ahead)
    }
  })

  it('has Basic speed at Tier 1\'s times the SDK\'s Tier 12 weight', () => {
    // The weight is what the SDK returns for Tier 12 at wave 1 (1.4844), where no wave growth
    // applies. Both panels cut to two decimals, which leaves up to 0.015 between the two sides.
    const weight = waveInfoEnemySpeed({ tier: TIER, wave: 1, enemyType: 'Basic' })
    expect(weight).toBeCloseTo(1.4844, 4)
    for (const r of READINGS) {
      const one = TIER_1.get(r.wave)
      if (!one) continue
      expect(Math.abs(r.basicSpeed - one.basicSpeed * weight), `wave ${r.wave}`).toBeLessThan(0.015)
    }
  })

  it('has the same mass in every row', () => {
    expect({ ...fixture.mass, note: '' }).toEqual({ ...tier1.mass, note: '' })
  })
})

describe('Wave Info panel, Tier 12 run — what the SDK reproduces', () => {
  it('Basic health is the base at the wave less the health skips', () => {
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicHealth)
      const sdk = computeWaveBaseHealthRaw({ tier: TIER, wave: r.wave - r.healthSkips })
      expect(asPanelHundredths(sdk, panel.unit), `wave ${r.wave}`).toBe(panel.hundredths)
    }
  })

  it('Basic attack is the base at the wave less the attack skips', () => {
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicAttack)
      const sdk = computeWaveBaseDamage({ tier: TIER, wave: r.wave - r.attackSkips })
      expect(asPanelHundredths(sdk, panel.unit), `wave ${r.wave}`).toBe(panel.hundredths)
    }
  })

  it('elite chance per row is a third of the chart value, starting at wave 157', () => {
    const totals = new Set<number>()
    for (const r of READINGS) {
      const total = eliteSpawnChanceAtWave(TIER, r.wave).singleSpawnPct
      totals.add(total)
      expect(Math.floor(total / 3), `wave ${r.wave}`).toBe(Math.floor(r.eliteEach))
    }
    expect([...totals].sort((a, b) => a - b)).toEqual([0, 1])
    expect(READINGS.find(r => r.eliteEach > 0)!.wave).toBe(157)
  })

  it('Boss chance is 100 on a boss wave and 0 otherwise', () => {
    const interval = bossWaveIntervalForTier(TIER)
    expect(READINGS.some(r => r.boss === 100)).toBe(true)
    for (const r of READINGS) {
      expect(isBossSpawnWave(r.wave, interval) ? 100 : 0, `wave ${r.wave}`).toBe(r.boss)
    }
  })

  it('Protector chance follows the wave-initialization formula from wave 80', () => {
    for (const r of READINGS.filter(x => x.wave >= 80)) {
      expect(newWaveProtectorChanceV29(TIER, r.wave), `wave ${r.wave}`).toBe(r.chance.Protector)
    }
  })

  it('Basic speed matches before the first speed step (waves 1 to 5)', () => {
    for (const r of READINGS.filter(x => x.wave <= 5)) {
      const sdk = waveInfoEnemySpeed({ tier: TIER, wave: r.wave, enemyType: 'Basic' })
      expect(Math.floor(sdk * 100) / 100, `wave ${r.wave}`).toBe(r.basicSpeed)
    }
  })
})

describe('Wave Info panel, Tier 12 run — measured gaps', () => {
  it.fails('ordinary spawn chances match the panel', () => {
    // Panel at wave 1: Basic 94 / Fast 5 / Tank 0 / Ranged 0. SDK: 87 / 5 / 4 / 4.
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

  it.fails('Protector chance follows the wave-initialization formula below wave 80', () => {
    // Panel 1% from wave 1; the SDK returns 0 until wave 80.
    for (const r of READINGS.filter(x => x.wave < 80)) {
      expect(newWaveProtectorChanceV29(TIER, r.wave), `wave ${r.wave}`).toBe(r.chance.Protector)
    }
  })

  it.fails('Basic speed matches the panel', () => {
    // Panel 1.50 at wave 6 and 1.60 at wave 100; SDK 1.48 at both. The panel's speed steps up at
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

  it.fails('spawn rate matches the panel', () => {
    // Panel 10 at wave 1; the SDK ramps linearly below the first chart row and returns 1.
    for (const r of READINGS) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })
})

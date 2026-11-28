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
 * The game's own Wave Info panel, read at (almost) every wave of Tier 1 from 1 to 8031, against
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

// q and Q are different suffixes, as are s and S: the order is q, Q, s, S.
const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15, Q: 1e18, s: 1e21, S: 1e24 }

/** "21.35B" → the mantissa in hundredths (2135) and the unit (1e9); "965.88" has unit 1. */
function parsePanelNumber(text: string): { hundredths: number, unit: number } {
  const match = /^(\d+)\.(\d{2})([KMBTqQsS]?)$/.exec(text)
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
  [2500, 45, 18, 22, 15, 42],
  [3000, 42, 19, 23, 16, 44],
  [3500, 40, 20, 23, 17, 45],
  [4000, 37, 21, 24, 18, 48],
  [4500, 36, 21, 24, 19, 49],
  [5000, 35, 22, 24, 19, 50],
  [5500, 33, 23, 25, 19, 52],
  [6000, 31, 24, 25, 20, 54],
  [6500, 29, 24, 26, 21, 56],
]

/** The first wave of this run at which the panel's health is about half the base (see below). */
const HEALTH_HALVED_FROM_WAVE = 4458
/** The same for attack: the trade-off perk 'Enemies damage -50.5%', picked later in the run. */
const ATTACK_HALVED_FROM_WAVE = 4812
/**
 * Boss health against Basic with the perk 'Boss health -70.3%'. The screen rounds the figure:
 * 20 x (1 - 0.703) is 5.94, and the panel's readings centre on 5.93.
 */
const BOSS_PERK_MULTIPLE = 5.93
/** The first wave of this run at which Boss health is eight times what it was (see below). */
const BOSS_HEALTH_X8_FROM_WAVE = 5638

/**
 * A panel number against 0.495 of the SDK's. The panel keeps only two decimals, so a short mantissa
 * ("1.52Q") pins the ratio less tightly than a long one ("746.52q"); the allowance follows that.
 */
function expectHalved(panel: { hundredths: number, unit: number }, sdk: number, label: string) {
  const ratio = (panel.hundredths * panel.unit) / 100 / sdk
  expect(Math.abs(ratio - 0.495), label).toBeLessThan(0.0005 + (0.01 * panel.unit) / sdk)
}

function stateAt(wave: number) {
  let state = STATES[0]!
  for (const row of STATES) if (row[0] <= wave) state = row
  return state
}

describe('Wave Info panel, Tier 1 runs — the fixture itself', () => {
  it('holds one reading per wave, in order, with ordinary chances that sum to 100', () => {
    expect(READINGS.length).toBe(7915)
    expect(READINGS[0]!.wave).toBe(1)
    expect(READINGS.at(-1)!.wave).toBe(8031)
    const seen = new Set<number>()
    for (let i = 0; i < READINGS.length; i += 1) {
      const r = READINGS[i]!
      if (i > 0) expect(r.wave, `reading ${i}`).toBeGreaterThan(READINGS[i - 1]!.wave)
      seen.add(r.wave)
      const c = r.chance
      expect(c.Basic + c.Fast + c.Tank + c.Ranged + c.Protector, `wave ${r.wave}`).toBe(100)
    }
    const missing: number[] = []
    for (let wave = 1; wave <= 8031; wave += 1) if (!seen.has(wave)) missing.push(wave)
    expect(missing).toEqual(fixture.missingWaves)
  })

  it('shows 32 states, each starting at the wave listed', () => {
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

  it('shows the Boss row changes at waves 1500 and 5638 of this run', () => {
    // Health 20x Basic to 5.93x and speed up by half: the trade-off perk 'Boss health -70.3%, but
    // boss speed +50%', picked around wave 1500. Then health eightfold at wave 5638 with speed
    // unchanged: the perk 'bosses have x8 health'. Both are on the run's Selected Perks screen
    // (fixture.perks); neither is a property of the wave.
    for (const r of READINGS) {
      const basic = parsePanelNumber(r.basicHealth)
      const boss = parsePanelNumber(r.bossHealth)
      const ratio = (boss.hundredths * boss.unit) / (basic.hundredths * basic.unit)
      if (r.wave < 1500) {
        expect(Math.abs(ratio / 20 - 1), `wave ${r.wave}`).toBeLessThan(0.01)
        expect(r.bossSpeed, `wave ${r.wave}`).toBe(r.protectorSpeed)
      } else {
        const expected = r.wave < BOSS_HEALTH_X8_FROM_WAVE ? BOSS_PERK_MULTIPLE : BOSS_PERK_MULTIPLE * 8
        expect(Math.abs(ratio / expected - 1), `wave ${r.wave}`).toBeLessThan(0.01)
        expect(r.bossSpeed, `wave ${r.wave}`).toBe(r.tankSpeed)
      }
    }
  })
})

describe('Wave Info panel, Tier 1 runs — what the SDK reproduces', () => {
  it('Basic health is the base at the wave less the health skips', () => {
    // Five readings sit one hundredth off the SDK, where the SDK value lands on the boundary
    // (965.8900469 shown as 965.88; 87.4000002B shown as 87.39B; 4.3599992T shown as 4.36T).
    //
    // From wave 4458 every health in the panel drops to 0.495 of what it was a wave earlier, with
    // attack and speed unchanged. That is the trade-off perk 'Enemies have -50.5% health' on the
    // run's Selected Perks screen (fixture.perks). Those readings are held to that ratio instead.
    const oneBelow: number[] = []
    const oneAbove: number[] = []
    let halved = 0
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicHealth)
      const sdk = computeWaveBaseHealthRaw({ tier: TIER, wave: r.wave - r.healthSkips })
      if (r.wave >= HEALTH_HALVED_FROM_WAVE) {
        halved += 1
        expectHalved(panel, sdk, `wave ${r.wave}`)
        continue
      }
      const difference = asPanelHundredths(sdk, panel.unit) - panel.hundredths
      if (difference === 1) oneBelow.push(r.wave)
      else if (difference === -1) oneAbove.push(r.wave)
      else expect(difference, `wave ${r.wave}`).toBe(0)
    }
    expect(oneBelow).toEqual([65, 1767])
    expect(oneAbove).toEqual([2425, 2426, 3511])
    expect(halved).toBe(3522)
  })

  it('Basic attack is the base at the wave less the attack skips', () => {
    // The SDK returns a whole number, so below 1,000 only the whole part can be compared. Six
    // readings sit one hundredth off the SDK, each where the SDK value is on the boundary
    // (278,280 shown as 278.27K; 285,879,950 shown as 285.88M).
    //
    // From wave 4812 every attack in the panel drops to 0.495 of what it was a wave earlier, as
    // health did at wave 4458: the trade-off perk 'Enemies damage -50.5%' (fixture.perks).
    const oneBelow: number[] = []
    const oneAbove: number[] = []
    let halved = 0
    for (const r of READINGS) {
      const panel = parsePanelNumber(r.basicAttack)
      const sdk = computeWaveBaseDamage({ tier: TIER, wave: r.wave - r.attackSkips })
      if (r.wave >= ATTACK_HALVED_FROM_WAVE) {
        halved += 1
        expectHalved(panel, sdk, `wave ${r.wave}`)
        continue
      }
      if (panel.unit === 1) {
        expect(sdk, `wave ${r.wave}`).toBe(Math.floor(panel.hundredths / 100))
        continue
      }
      const difference = asPanelHundredths(sdk, panel.unit) - panel.hundredths
      if (difference === 1) oneBelow.push(r.wave)
      else if (difference === -1) oneAbove.push(r.wave)
      else expect(difference, `wave ${r.wave}`).toBe(0)
    }
    expect(oneBelow).toEqual([919, 939, 940, 1200, 1262])
    expect(oneAbove).toEqual([4576])
    expect(halved).toBe(3174)
  })

  it('elite chance per row is a third of the chart value, across ten chart thresholds', () => {
    const totals = new Set<number>()
    for (const r of READINGS) {
      const total = eliteSpawnChanceAtWave(TIER, r.wave).singleSpawnPct
      totals.add(total)
      expect(Math.floor(total / 3), `wave ${r.wave}`).toBe(Math.floor(r.eliteEach))
    }
    // 0% to wave 499, 1% from 500, 4% from 1000, 9% from 1500, 16% from 2000, 25% from 3000,
    // 36% from 4000, 49% from 5000, 64% from 6000,
    // 81% from 7000, 100% from 8000.
    expect([...totals].sort((a, b) => a - b)).toEqual([0, 1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
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

  it('spawn rate matches the Wave Accelerator chart from wave 1000 up, outside two bands', () => {
    // The two bands, 1250 to 1499 and 3500 to 3999, are measured gaps below.
    const charted = READINGS.filter(r => r.wave >= 1000 && !(r.wave >= 1250 && r.wave < 1500) && !(r.wave >= 3500 && r.wave < 4000))
    expect(new Set(charted.map(r => r.spawnRate))).toEqual(new Set([37, 39, 40, 42, 44, 48, 49, 50, 52, 54, 56]))
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

  it.fails('spawn rate matches the panel between waves 3500 and 4000', () => {
    // Panel 45 from wave 3500 to 3999; the SDK returns 46.
    const band = READINGS.filter(r => r.wave >= 3500 && r.wave < 4000)
    expect(band.length).toBeGreaterThan(400)
    for (const r of band) {
      expect(enemySpawnRateCap(r.wave, TIER, { waveAcceleratorMastery: MASTERY }), `wave ${r.wave}`).toBe(r.spawnRate)
    }
  })

  it.fails('mass matches the panel from wave 4000, where it starts to grow', () => {
    // Panel Saboteur mass is 1000.00 up to wave 4000 and the wave less 3000 after it (1666.00 at
    // wave 4666); Basic goes from 1.05 to 1.75.
    const growing = READINGS.filter(r => r.wave > 4000)
    expect(growing.length).toBeGreaterThan(600)
    for (const r of growing) {
      if (r.basicMass === undefined || r.saboteurMass === undefined) throw new Error(`no mass at wave ${r.wave}`)
      expect(r.saboteurMass, `wave ${r.wave}`).toBe(r.wave - 3000)
      const basic = waveInfoEnemyMass({ tier: TIER, wave: r.wave, enemyType: 'Basic' })
      expect(Math.abs(basic - r.basicMass), `wave ${r.wave}`).toBeLessThan(0.01)
    }
  })
})

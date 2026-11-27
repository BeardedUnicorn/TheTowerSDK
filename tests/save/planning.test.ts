import { describe, expect, it } from 'vitest'
import { buildResourceDropsCoinMultipliers } from '../../src/mechanics/resource-drops/coin-multipliers'
import { simulateResourceDropsCoins } from '../../src/mechanics/resource-drops/coin-simulation'
import {
  affordableByFromSave,
  buildCoinSimulationInputFromSnapshot,
  checkCoinModelFromSave,
  forecastIncomeFromSave,
  measureCoinShares,
  measureOrdinaryCoinWeights,
  measureOrdinaryKills,
  ordinaryCoinWeightAtWave,
  ordinaryKillScaleAtWave,
  planCellBudgetFromSave,
  planSpendingFromSave,
  priceDissonancePaybackFromSave,
  rankSpendsFromSave,
  readCoinModuleBonusesFromSnapshot,
  readCoinWeaponInputsFromSnapshot,
  scheduleLabsFromSave,
  toExportSnapshot,
} from '../../src/save'
import { PLANNING_HISTORY, PLANNING_SAVE, PLANNING_SOURCES } from '../helpers/planning-fixture'

const QUICK_SURVIVAL = { survivalFit: { maxRuns: 2, seeds: 2, passes: 1, skipLeaveOneOut: true }, survivalSeeds: 12 }

/*
 * The account's own figures, from its run records on Nov 26 after both packs: three full farm
 * runs of 2.65B, 2.34B and 2.12B coins in 3.34, 2.99 and 3.22 hours, with 4,422, 2,556 and 3,342
 * cells. Medians by hand: 2.34B a run, 0.78B and 1,037 cells an hour.
 */
describe('the income forecast', () => {
  const forecast = forecastIncomeFromSave(PLANNING_SOURCES)!

  it('takes its rates from the full farm runs since the last change in income', () => {
    expect(forecast.tier).toBe(7)
    expect(forecast.runs.filter(run => run.used).map(run => run.wave)).toEqual([2230, 1826, 2039])
    expect(forecast.coinsPerRun?.median).toBeCloseTo(2.34e9, -7)
    expect(forecast.coinsPerHour?.median).toBeCloseTo(2_339_854_000 / (10_778.04 / 3600), -6)
    expect(forecast.cellsPerHour?.median).toBeCloseTo(1037, 0)
    expect(forecast.coinsPerDay?.median).toBeCloseTo((forecast.coinsPerHour?.median ?? 0) * forecast.hoursPerDay, 0)
    expect(forecast.coinsPerDay!.p25).toBeLessThan(forecast.coinsPerDay!.median)
    expect(forecast.coinsPerDay!.median).toBeLessThan(forecast.coinsPerDay!.p75)
  })

  it('leaves the 7-second and 296-wave restarts out, and flags the 296-wave run as paused', () => {
    const restarts = forecast.runs.filter(run => run.kind === 'restart')
    expect(restarts.map(run => run.wave)).toContain(296)
    expect(restarts.find(run => run.realSeconds < 10)?.wave).toBe(1)
    expect(restarts.every(run => !run.used)).toBe(true)
    expect(forecast.pausedRuns.map(run => run.wave)).toEqual([296])
    expect(forecast.runs.filter(run => run.kind === 'tournament').every(run => run.tier === 5)).toBe(true)
    expect(forecast.runs.find(run => run.kind === 'dissonant')?.wave).toBe(1667)
  })

  it('finds the change in income from the exports, and from the runs alone without them', () => {
    expect(forecast.regimeBreaks.map(row => [row.reason, Math.round(row.ratio)])).toEqual([['coin-bonus', 2], ['coin-bonus', 3]])
    const alone = forecastIncomeFromSave({ save: PLANNING_SAVE })!
    expect(alone.regimeBreaks).toHaveLength(1)
    expect(alone.regimeBreaks[0]).toMatchObject({ reason: 'income-step', after: '2026-11-26T02:29:00.649Z', before: '2026-11-26T10:07:04.975Z' })
    expect(alone.runsUsed).toBe(3)
    expect(alone.pausedRuns).toEqual([])
    expect(alone.warnings.join(' ')).toMatch(/no earlier exports/)
  })

  it('counts hours from the runs it has, and takes an override', () => {
    expect(forecast.uptime.map(window => window.days).slice(0, 2)).toEqual([1, 7])
    expect(forecast.hoursPerDay).toBeCloseTo(forecast.uptime[0].hoursPerDay, 9)
    expect(forecast.uptime[1].hoursPerDay).toBeLessThan(forecast.uptime[0].hoursPerDay)
    const fixed = forecastIncomeFromSave({ ...PLANNING_SOURCES, hoursPerDay: 13.4 })!
    expect(fixed.coinsPerDay?.median).toBeCloseTo((forecast.coinsPerHour?.median ?? 0) * 13.4, 0)
    expect(forecastIncomeFromSave({ ...PLANNING_SOURCES, tier: 5 })?.coinsPerDay).toBeNull()
    expect(forecastIncomeFromSave({ save: null })).toBeNull()
  })

  it('dates a shopping list in order from the coins on hand', () => {
    const list = [{ name: 'cheap', coins: 1e9 }, { name: 'dear', coins: 20e9 }]
    const dated = affordableByFromSave({ ...PLANNING_SOURCES, list })!
    expect(dated.balance).toBe(1_791_588_000)
    expect(dated.items[0].affordableAt).toEqual({ early: dated.now, likely: dated.now, late: dated.now })
    const days = (Date.parse(dated.items[1].affordableAt.likely) - Date.parse(dated.now)) / 86_400_000
    expect(days).toBeCloseTo((21e9 - dated.balance) / forecast.coinsPerDay!.median, 6)
    expect(Date.parse(dated.items[1].affordableAt.early)).toBeLessThan(Date.parse(dated.items[1].affordableAt.late))
  })
})

/*
 * The packs took Total Coin Bonus from x30.75 to x184.5, a factor of 6. Two things the run
 * records show about that, by hand:
 *
 * - Wave coins per wave. The model gives 60.1K a wave after the packs; the run to wave 2,230
 *   recorded 135.1M over 2,230 waves, 60.6K. So the model's multipliers are right.
 * - Before the packs the same figure ranged from 7.3K to 22.1K a wave across two weeks with
 *   nothing bought, a factor of three between runs: the perks taken in a run.
 */
describe('predicted against recorded coins', () => {
  const check = checkCoinModelFromSave(PLANNING_SOURCES)!
  const run = (wave: number) => check.perRun.find(row => row.wave === wave)!

  it('predicts wave coins to within a few percent with no fitting at all', () => {
    expect(run(2230).actualWaveCoins).toBeCloseTo(135.1e6, -5)
    expect(Math.abs(run(2230).waveCoinRatio! - 1)).toBeLessThan(0.015)
  })

  it('predicts a whole run to within a factor of about two before anything is fitted', () => {
    // 1.56B predicted against 2.65B recorded for the run to wave 2,230, which took almost no perks.
    // The kills, the skipped waves and the coin windows are the run's own by now; what is short is
    // coins per kill, most likely perks that raise a weapon's coin bonus, which no record lists.
    const predictedUnfitted = run(2230).predictedWaveCoins! + run(2230).predictedKillCoins!
    expect(run(2230).actual / predictedUnfitted).toBeGreaterThan(1.5)
    expect(run(2230).actual / predictedUnfitted).toBeLessThan(2.6)
  })

  it('counts the run\'s enemies as the run records do, at every depth', () => {
    // By hand: the run to wave 2,230 recorded 216,892 ordinary enemies, and the spawn chance
    // chart gives about half as many again; the 48-wave run recorded 2,405 where it gives 250.
    const scales = check.killScales
    expect(scales.find(row => row.wave === 2230)!.scale).toBeGreaterThan(0.55)
    expect(scales.find(row => row.wave === 2230)!.scale).toBeLessThan(0.8)
    expect(scales.find(row => row.wave === 48)!.scale).toBeGreaterThan(5)
    expect(measureOrdinaryKills(toExportSnapshot(PLANNING_SAVE)!.runs, 7).find(row => row.wave === 2230)?.kills).toBe(216_892)
    expect(ordinaryKillScaleAtWave([{ wave: 1000, scale: 1 }, { wave: 2000, scale: 0.6 }], 1500)).toBeCloseTo(0.8, 12)
    expect(ordinaryKillScaleAtWave([], 1500)).toBeNull()
    // Wave-skip coins: 630.6M recorded, a quarter of the run. The model had them at a twentieth.
    const built = buildCoinSimulationInputFromSnapshot(toExportSnapshot(PLANNING_SAVE)!, 7, 2230, 25.2, { ordinaryCoinWeight: 1.125, ordinaryKillScale: 0.67 })!
    const coins = simulateResourceDropsCoins(built.input).coins
    const modelledShare = coins.coinsFromKillsWaveSkipBonus / coins.totalCoins
    expect(630_621_700 / 2_646_670_000).toBeCloseTo(0.238, 3)
    expect(modelledShare).toBeGreaterThan(0.12)
    expect(modelledShare).toBeLessThan(0.3)
  })

  it('fits what is left of kill coins to the account, and reports the scale', () => {
    expect(check.calibration?.runsFitted).toBe(28)
    // With the weapons and modules read and the enemy mix, kill counts and coin windows measured,
    // coins per kill are about 0.6 of the records. The scale was 18 with none of that, and 0.014 while the model also
    // multiplied a kill's coins by the wave.
    expect(check.calibration?.scale).toBeGreaterThan(0.7)
    expect(check.calibration?.scale).toBeLessThan(2.5)
    expect(Math.abs(check.calibration!.waveExponent)).toBeLessThan(0.6)
    // Calibrated, a run's ratio is its own factor, close to what its wave coins alone say.
    for (const row of check.perRun.filter(entry => entry.state !== 'unsettled')) {
      expect(row.ratio! / row.waveCoinRatio!).toBeGreaterThan(0.75)
      expect(row.ratio! / row.waveCoinRatio!).toBeLessThan(1.4)
    }
    expect(run(2230).ratio).toBeGreaterThan(0.9)
    expect(run(2230).ratio).toBeLessThan(1.2)
  })

  it('measures the drift across both pack purchases as one change, against how much runs differ', () => {
    expect(check.changedBetween).toMatchObject({ after: '2026-11-26T03:40:37.111Z', before: '2026-11-26T06:32:50.148Z' })
    expect(check.changedBetween?.ratio).toBeCloseTo(6, 4)
    // Two matched pairs say the packs half arrived; 27 runs say runs differ by more than that anyway.
    expect(check.pairs).toHaveLength(2)
    expect(check.driftFactor).toBeGreaterThan(0.45)
    expect(check.driftFactor).toBeLessThan(0.6)
    expect(check.waveCoinDrift).toBeGreaterThan(0.75)
    expect(check.waveCoinDrift).toBeLessThan(0.9)
    expect(check.runToRunSpread).toBeGreaterThan(1.5)
    expect(check.passThrough).toBe(1)
    expect(check.warnings.join(' ')).toMatch(/by which this account's runs differ with nothing changed/)
  })

  it('reports each source against itself, furthest from the prediction first', () => {
    expect(check.sources.find(source => source.source === 'coinsFromGoldenTower')).toBeDefined()
    expect(check.sources.map(source => Math.abs(Math.log(source.drift)))).toEqual(
      [...check.sources.map(source => Math.abs(Math.log(source.drift)))].sort((a, b) => b - a),
    )
  })

  it('says how sure each run\'s state is, and uses a run only as far as that allows', () => {
    // Played between an export with the Coins card off and one with it on, and none during.
    expect(run(2193).state).toBe('unsettled')
    expect(check.pairs.some(pair => pair.before === run(2193).runDate)).toBe(false)
    expect(run(2220).state).toBe('known')
    expect(check.perRun.filter(row => row.state === 'assumed')).toHaveLength(22)
    expect(check.warnings.join(' ')).toMatch(/22 runs were played before the oldest export/)
    expect(check.unfilled.length).toBeGreaterThan(0)
  })

  it('does not compare across a change in income it has only one export for', () => {
    const alone = checkCoinModelFromSave({ save: PLANNING_SAVE })!
    expect(alone.pairs).toEqual([])
    expect(alone.waveCoinDrift).toBeNull()
    expect(alone.passThrough).toBe(1)
    // The scale is still fitted: a wrong coin bonus is in kill and wave coins alike.
    expect(alone.calibration!.scale / check.calibration!.scale).toBeCloseTo(1, 1)
  })
})

/*
 * The account's Ultimate Weapons screen: Golden Tower at bonus 10, duration 6, cooldown 3, with
 * the Golden Tower Duration lab at 16. Its run to wave 2,230 recorded 30,153 of 219,819 enemies
 * destroyed inside Golden Tower: 13.7%.
 */
describe('the coin model\'s inputs from an export', () => {
  const snapshot = toExportSnapshot(PLANNING_SAVE)!
  const recorded = snapshot.runs.find(row => row.wave === 2230)!

  it('reads the weapons the account owns, and none it does not', () => {
    const weapons = readCoinWeaponInputsFromSnapshot(snapshot, 7)!
    expect(weapons.uwLevels).toMatchObject({ gtMultiplierLevel: 10, gtDurLevel: 6, gtCdLevel: 3, gtDurLab: 16, bhCdLevel: 0, bhDurLevel: 0 })
    expect(weapons.owned).toContain('goldentower')
    expect(weapons.owned).not.toContain('blackhole')
    expect(weapons.uptime.bhCdLevel).toBeNull()
    expect(readCoinWeaponInputsFromSnapshot({ ...snapshot, readers: {} }, 7)).toBeNull()
  })

  it('opens the Golden Tower window as often as the run records say enemies died in it', () => {
    const built = buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230)!
    const share = Number(recorded.destroyedInGoldenTower) / Number(recorded.totalEnemies)
    expect(share).toBeCloseTo(0.137, 3)
    expect(buildResourceDropsCoinMultipliers(built.input).gtUptimeRatio).toBeCloseTo(share, 2)
    expect(built.unfilled.join(' ')).not.toMatch(/ultimate weapon levels/)
    const bare = buildCoinSimulationInputFromSnapshot({ ...snapshot, readers: { readTotalCoinBonusFromSaveRoot: snapshot.readers.readTotalCoinBonusFromSaveRoot } }, 7, 2230)!
    expect(bare.input.uptime).toBeNull()
    expect(bare.unfilled.join(' ')).toMatch(/ultimate weapon levels/)
  })

  /*
   * The account's modules: the Generator carries Coins / Kill Bonus +0.3 (Epic) and the Core
   * carries Golden Tower - Bonus +1x (Epic). Its Golden Bot is owned with Bonus at level 0.
   */
  it('reads the module sub-effects that add to coins from kills', () => {
    expect(readCoinModuleBonusesFromSnapshot(snapshot)).toEqual({ coinsKillBonus: 0.3, goldenTowerBonus: 1, goldenBotBonusLevel: 0 })
    expect(readCoinModuleBonusesFromSnapshot({ ...snapshot, readers: {} })).toEqual({ coinsKillBonus: 0, goldenTowerBonus: 0, goldenBotBonusLevel: null })
    const multipliers = buildResourceDropsCoinMultipliers(buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230)!.input)
    // Coins / Kill is workshop 2.49 x lab 2.26, plus the module's 0.3 inside the bracket.
    expect(multipliers.workshopCoinsKillMult * multipliers.coinsKillLabMult + multipliers.moduleCoinsKillBonus).toBeCloseTo(2.49 * 2.26 + 0.3, 6)
    // Golden Tower is stones 13 + lab 1.95, plus the module's 1.
    expect(multipliers.gtCoinMult).toBeCloseTo(15.95, 6)
  })

  /*
   * By hand for the run to wave 2,230, of 219,819 enemies: 30,153 destroyed inside Golden Tower
   * (13.7%), 34,892 inside Spotlight (15.9%), 19,007 tagged by Death Wave (8.6%), 3,530 inside
   * the Golden Bot (1.6%); and 234.8M of 2,511.5M kill coins from Critical Coin (9.3%).
   */
  it('measures the coin windows and Critical Coin from the run records', () => {
    const one = measureCoinShares([recorded], 7)!
    expect(one.windowShares.goldenTower).toBeCloseTo(30_153 / 219_819, 9)
    expect(one.windowShares.spotlight).toBeCloseTo(34_892 / 219_819, 9)
    expect(one.windowShares.deathWave).toBeCloseTo(19_007 / 219_819, 9)
    expect(one.windowShares.goldenBot).toBeCloseTo(3_530 / 219_819, 9)
    expect(one.criticalCoinShare).toBeCloseTo(0.093, 2)
    const all = measureCoinShares(snapshot.runs, 7)!
    expect(all.runs).toBeGreaterThan(20)
    // Steady from run to run: the median over every run is within a point of this one.
    expect(Math.abs(all.windowShares.goldenTower! - one.windowShares.goldenTower!)).toBeLessThan(0.01)
    expect(measureCoinShares(snapshot.runs, 5)).toBeNull()
    expect(measureCoinShares([{ tier: 7, totalEnemies: 5000 }], 7)).toEqual({ windowShares: {}, criticalCoinShare: 0, runs: 1 })
  })

  it('uses the measured shares in place of the uptime model, and counts the Golden Bot only then', () => {
    const shares = measureCoinShares([recorded], 7)!
    const measured = buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230, 26, { ordinaryCoinWeight: 1, windowShares: shares.windowShares, criticalCoinShare: shares.criticalCoinShare })!
    const multipliers = buildResourceDropsCoinMultipliers(measured.input)
    expect(multipliers.slUptimeRatio).toBeCloseTo(34_892 / 219_819, 9)
    expect(multipliers.dwUptimeRatio).toBeCloseTo(19_007 / 219_819, 9)
    expect(multipliers.goldenBotMult).toBeGreaterThan(1)
    // Independent windows: each multiplies on its own share of kills.
    const expected = (1 + shares.windowShares.goldenTower! * 14.95) * (1 + shares.windowShares.spotlight! * 1.2)
      * (1 + shares.windowShares.deathWave! * 1.1) * (1 + shares.windowShares.goldenBot! * (multipliers.goldenBotMult - 1))
    expect(multipliers.expectedTimedKillMult).toBeCloseTo(expected, 9)
    // Critical Coin's share of kill coins comes in through the weight: 1 / (1 - share).
    expect(measured.input.ordinaryCoinWeight).toBeCloseTo(1 / (1 - shares.criticalCoinShare), 12)
    const modelled = buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230)!
    expect(modelled.input.useGoldenBotCoinBonus).toBe(false)
    expect(modelled.unfilled.join(' ')).toMatch(/share of kills inside each coin window/)
    expect(measured.unfilled.join(' ')).not.toMatch(/share of kills inside each coin window/)
  })

  it('measures the enemy mix from the run records, richer the deeper the run', () => {
    // By hand for the run to wave 2,230: 31,572 Fast, 32,846 Tank, 24,371 Ranged and 255
    // Protectors among 216,892 ordinary enemies: (2x31,572 + 4x32,846 + 2x24,371 + 3x255) / 216,892.
    const weights = measureOrdinaryCoinWeights(snapshot.runs, 7)
    expect(weights.find(row => row.wave === 2230)?.weight).toBeCloseTo((2 * 31_572 + 4 * 32_846 + 2 * 24_371 + 3 * 255) / 216_892, 6)
    const shallow = ordinaryCoinWeightAtWave(weights, 1077)!
    const deep = ordinaryCoinWeightAtWave(weights, 2697)!
    expect(shallow).toBeLessThan(deep)
    // Beyond either end it holds the nearest measured run, and between two it interpolates.
    expect(ordinaryCoinWeightAtWave(weights, 10)).toBe(weights[0].weight)
    expect(ordinaryCoinWeightAtWave(weights, 9999)).toBe(weights.at(-1)!.weight)
    expect(ordinaryCoinWeightAtWave([{ wave: 1000, weight: 1 }, { wave: 2000, weight: 2 }], 1500)).toBe(1.5)
    expect(ordinaryCoinWeightAtWave([], 1500)).toBeNull()
    // Tournaments and other tiers are not this tier's farming mix.
    expect(measureOrdinaryCoinWeights(snapshot.runs, 5)).toEqual([])
    // The tier's spawn chances, which the simulation falls back to, give about a third of it.
    expect(buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230, 26, { ordinaryCoinWeight: deep })!.input.ordinaryCoinWeight).toBe(deep)
    expect(buildCoinSimulationInputFromSnapshot(snapshot, 7, 2230)!.unfilled.join(' ')).toMatch(/enemy mix by wave/)
  })
})

/*
 * The save's own lab reading: slot 3 has Golden Tower Bonus 13 with 59,042 unboosted seconds
 * left under a 2x boost that outlasts it, so it ends 29,521 s after the 20:34:29 UTC export —
 * 04:46:30 UTC, 9:46 PM MST. Slot 1 has 177,526 s left and 36,563 s of 2x: 140,963 s to go.
 */
describe('the lab schedule', () => {
  const schedule = scheduleLabsFromSave({ ...PLANNING_SOURCES, timeZone: 'America/Denver' })!
  const exported = Date.parse('2026-11-26T20:34:28.974Z')

  it('reproduces each running lab\'s finish time from the save', () => {
    const running = schedule.rows.filter(row => row.start === null)
    expect(running.map(row => `${row.lab} ${row.toLevel}`)).toEqual([
      'Labs Speed 55', 'Spotlight Coin Bonus 13', 'Golden Tower Bonus 14', 'Coins / Kill Bonus 64', 'Golden Tower Duration 17',
    ])
    const expected = [140_963, 232_320, 29_521, 239_934, 768_201]
    const off = running.map((row, index) => (Date.parse(row.finish) - (exported + expected[index] * 1000)) / 1000)
    // Labs Speed 55 and Golden Tower Bonus 14 end before anything changes: to the second.
    expect(Math.abs(off[0])).toBeLessThan(60)
    expect(Math.abs(off[2])).toBeLessThan(60)
    // The other three are still running when Labs Speed 55 lands, and finish sooner for it:
    // 2.10x against 2.08x is under 1% of what is left.
    for (const index of [1, 3, 4]) {
      expect(off[index]).toBeLessThan(0)
      expect(-off[index]).toBeLessThan(expected[index] * 0.01)
    }
    expect(running[2].finishLocal).toBe('Thu, Nov 26, 9:46 PM MST')
    expect(schedule.labSpeed).toBeCloseTo(2.1528, 4)
  })

  it('starts the next lab as the slot frees when the coins are there', () => {
    const next = schedule.rows.find(row => row.lab === 'Golden Tower Bonus' && row.toLevel === 15)!
    expect(next.start).toBe(schedule.rows.find(row => row.lab === 'Golden Tower Bonus' && row.toLevel === 14)?.finish)
    expect(next.coinsNeeded).toBeCloseTo(1.864e9, -7)
    expect(next.shortfall).toBeUndefined()
    expect(schedule.rows.every(row => row.permanent)).toBe(true)
  })

  it('flags a shortfall whenever a start costs more than the forecast balance', () => {
    const poor = scheduleLabsFromSave({ ...PLANNING_SOURCES, forecast: { ...forecastIncomeFromSave(PLANNING_SOURCES)!, coinsPerDay: { p25: 1e8, median: 1e8, p75: 1e8 } } })!
    const waited = poor.rows.find(row => row.lab === 'Golden Tower Bonus' && row.toLevel === 15)
    const freed = Date.parse(poor.rows.find(row => row.lab === 'Golden Tower Bonus' && row.toLevel === 14)!.finish)
    if (waited) {
      expect(waited.shortfall?.coins).toBeGreaterThan(0)
      expect(Date.parse(waited.start!)).toBeGreaterThan(freed)
      expect(waited.shortfall?.waitSeconds).toBeCloseTo((Date.parse(waited.start!) - freed) / 1000, 0)
    }
    else {
      expect(poor.warnings.join(' ')).toMatch(/still waiting for the coins for Golden Tower Bonus 15/)
    }
    expect(poor.warnings.join(' ')).toMatch(/slot 3 frees .* without the coins/)
    expect(poor.timeZone).toBe('UTC')
  })
})

describe('the cell budget', () => {
  it('sizes boosts to cell income and reports the bank against the floor', () => {
    const budget = planCellBudgetFromSave({ ...PLANNING_SOURCES, floor: 5000 })!
    expect(budget.bank).toBe(15_565)
    expect(budget.policy.map(slot => slot.multiplier)).toEqual([2, 2, 2, 2, 2])
    expect(budget.cellsPerDay).toBe(12_000)
    expect(budget.cellsPerDay).toBeLessThanOrEqual(budget.income.median)
    expect(budget.daysToFloor.median).toBeNull()
    expect(budget.renewAt).toHaveLength(5)
    expect(budget.warnings.join(' ')).toMatch(/not confirmed in game/)
    const confirmed = planCellBudgetFromSave({ ...PLANNING_SOURCES, cellsPerHourByMultiplier: { 1.5: 15, 2: 100 } })!
    expect(confirmed.warnings.join(' ')).not.toMatch(/not confirmed in game/)
  })
})

/*
 * The coin_bonus what-ifs for this account, one call each on Nov 26: a tier-7 Dissonant run to
 * wave 1,800, 2,000 or 2,200 takes Total Coin Bonus from x184.5 to x190.5, x200.1 or x210.5.
 */
describe('Dissonance payback', () => {
  const payback = priceDissonancePaybackFromSave({ ...PLANNING_SOURCES, waves: [1800, 2000, 2200], passThrough: 1, paybackLimitDays: 5 })!

  it('matches the single what-ifs exactly', () => {
    expect(payback.currentWave).toBe(1667)
    expect(payback.rows.map(row => row.totalBonus.toFixed(1))).toEqual(['190.5', '200.1', '210.5'])
    expect(payback.rows.map(row => (row.gain * 100).toFixed(1))).toEqual(['3.2', '8.5', '14.1'])
    expect(payback.permanent).toBe(true)
  })

  it('prices the farm run given up, and finds the wave that pays back in time', () => {
    for (const row of payback.rows) {
      expect(row.cost).toBeCloseTo(2_339_854_000 - 199, 0)
      expect(row.paybackDays).toBeCloseTo(row.cost / (payback.coinsPerDay * row.gain), 6)
    }
    expect(payback.rows[0].paybackDays).toBeGreaterThan(5)
    expect(payback.breakEvenWave).toBeGreaterThan(1800)
    expect(payback.breakEvenWave).toBeLessThan(2000)
    const discounted = priceDissonancePaybackFromSave({ ...PLANNING_SOURCES, waves: [2000], passThrough: 0.6 })!
    expect(discounted.rows[0].paybackDays).toBeCloseTo((payback.rows[1].paybackDays ?? 0) / 0.6, 6)
    expect(priceDissonancePaybackFromSave({ ...PLANNING_SOURCES, waves: [1500] })?.rows[0].paybackDays).toBeNull()
  })
})

describe('the spend ranking from a stored snapshot', () => {
  const ranking = rankSpendsFromSave({
    ...PLANNING_SOURCES, passThrough: 0.6, dissonantWave: 2000, ...QUICK_SURVIVAL,
    workshopTargets: [{ stat: 'Recovery Amount', toLevel: 100 }, { stat: 'Health', toLevel: 1500 }, { stat: 'Damage', toLevel: 900 }],
  })!

  it('prices workshop levels at the account\'s discount and never calls them permanent', () => {
    const recovery = ranking.coinQueue.find(row => row.candidate === 'Recovery Amount 35 → 100')!
    expect(recovery.coins).toBe(3_360_252_115)
    expect(recovery.permanent).toBe(false)
    expect(recovery.gainPerDay.low).toBeLessThanOrEqual(recovery.gainPerDay.likely)
    expect(recovery.gainPerDay.likely).toBeLessThanOrEqual(recovery.gainPerDay.high)
    expect(ranking.coinQueue.find(row => row.kind === 'dissonant-run')?.permanent).toBe(true)
  })

  it('explains what it did not rank instead of dropping it', () => {
    expect(ranking.labQueue).toEqual([])
    expect(ranking.warnings.join(' ')).toMatch(/economy planner reads a decoded save/)
    expect(ranking.notRanked.find(row => row.candidate === 'Damage → 900')?.reason).toMatch(/not a stat the wave survival model reads/)
    expect(ranking.notRanked.map(row => row.candidate)).toContain('Module slot levels')
    expect(ranking.coinQueue.every(row => row.kind !== 'lab')).toBe(true)
  })
})

describe('the whole plan', () => {
  it('runs every tool in order and returns one answer', () => {
    const plan = planSpendingFromSave({ ...PLANNING_SOURCES, timeZone: 'America/Denver', cellFloor: 5000, includeSurvival: false })!
    expect(plan.now).toBe('2026-11-26T20:34:28.974Z')
    expect(plan.forecast.runsUsed).toBe(3)
    expect('runs' in plan.forecast).toBe(false)
    expect(plan.coinModel?.passThrough).toBe(1)
    expect(plan.coinModel?.calibration?.runsFitted).toBe(28)
    expect(plan.labSchedule?.rows.filter(row => row.start === null)).toHaveLength(5)
    expect(plan.labSchedule?.timeZone).toBe('America/Denver')
    expect(plan.boostPolicy?.cellsPerDay).toBe(12_000)
    expect(plan.dissonance?.passThrough).toBe(plan.coinModel?.passThrough)
    expect(plan.warnings.join(' ')).toMatch(/workshop levels were not ranked/)
    expect(planSpendingFromSave({ save: 'nope' })).toBeNull()
    expect(PLANNING_HISTORY).toHaveLength(10)
  })
})

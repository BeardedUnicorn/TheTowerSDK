import { describe, expect, it } from 'vitest'
import {
  affordableBy,
  classifyPlanningRuns,
  findRegimeBreaks,
  forecastIncome,
  killCoinScaleAtWave,
  measureCoinDrift,
  planCellBudget,
  quantileBand,
  rankSpends,
} from '../../../src/mechanics/planning'
import type { CellBudgetInput, PlanningRun, SpendCandidate } from '../../../src/mechanics/planning'

const NOW = '2026-11-26T00:00:00.000Z'
const run = (hoursAgo: number, overrides: Partial<PlanningRun> = {}): PlanningRun => ({
  endedAt: new Date(Date.parse(NOW) - hoursAgo * 3_600_000).toISOString(),
  tier: 7, wave: 2000, realSeconds: 3 * 3600, coins: 3e8, cells: 3000, tournament: false, dissonant: false, endedByPlayer: false, ...overrides,
})

describe('quantileBand', () => {
  it('interpolates between neighbours and ignores what is not a number', () => {
    expect(quantileBand([1, 2, 3, 4])).toEqual({ p25: 1.75, median: 2.5, p75: 3.25 })
    expect(quantileBand([3, Number.NaN, 1, 2])).toEqual({ p25: 1.5, median: 2, p75: 2.5 })
    expect(quantileBand([7])).toEqual({ p25: 7, median: 7, p75: 7 })
    expect(quantileBand([])).toBeNull()
  })
})

describe('classifying runs', () => {
  it('tells a restart from an early death, and a paused run from a played one', () => {
    const [restart, died, tournament, dissonant, paused] = classifyPlanningRuns([
      run(50, { realSeconds: 600, endedByPlayer: true }),
      run(40, { realSeconds: 600, endedByPlayer: false }),
      run(30, { tournament: true, tier: 5 }),
      run(20, { dissonant: true }),
      run(10, { realSeconds: 1800, firstSeenAt: new Date(Date.parse(NOW) - 12.5 * 3_600_000).toISOString() }),
    ])
    expect([restart.kind, died.kind, tournament.kind, dissonant.kind]).toEqual(['restart', 'farm', 'tournament', 'dissonant'])
    expect(restart.paused).toBe(false)
    // Seen in progress 2.5 hours before it ended, with half an hour of real time: it sat paused.
    expect(paused.paused).toBe(true)
    expect(died.coinsPerHour).toBe(3e8 / (600 / 3600))
    expect(classifyPlanningRuns([run(1, { realSeconds: 3600, firstSeenAt: new Date(Date.parse(NOW) - 2.2 * 3_600_000).toISOString() })])[0].paused).toBe(false)
  })
})

describe('regime breaks', () => {
  const farm = (coins: number[]) => classifyPlanningRuns(coins.map((amount, index) => run(100 - index * 5, { coins: amount })))

  it('takes a jump in the coin bonus over any step in the runs, and ignores a dip that recovers', () => {
    const readings = [30, 20.8, 30.7, 61.5, 184.5].map((total, index) => ({ at: `2026-11-2${index}T00:00:00.000Z`, tier: 7, total }))
    expect(findRegimeBreaks(farm([1, 1, 1, 5]), readings).map(row => [row.reason, row.after.slice(8, 10), Number(row.ratio.toFixed(2))])).toEqual([
      ['coin-bonus', '22', 2],
      ['coin-bonus', '23', 3],
    ])
  })

  it('finds a clean step in coins per hour, and no step in noise', () => {
    const stepped = findRegimeBreaks(farm([3e8, 4e8, 3.5e8, 9e8, 1e9]))
    expect(stepped).toHaveLength(1)
    expect(stepped[0].reason).toBe('income-step')
    expect(findRegimeBreaks(farm([3e8, 9e8, 3.5e8, 9e8, 4e8]))).toEqual([])
    // Two runs before the step are too few to tell it from noise.
    expect(findRegimeBreaks(farm([3e8, 3e8, 9e8, 9e8]))).toEqual([])
  })
})

describe('forecastIncome', () => {
  it('multiplies the median rate by the hours actually run', () => {
    const forecast = forecastIncome({ runs: [run(20), run(12), run(4)], now: NOW })
    expect(forecast.coinsPerHour?.median).toBe(1e8)
    // Three 3-hour runs in the last 24 hours.
    expect(forecast.hoursPerDay).toBeCloseTo(9, 9)
    expect(forecast.coinsPerDay?.median).toBeCloseTo(9e8, 0)
    expect(forecast.cellsPerDay?.median).toBeCloseTo(9000, 6)
    expect(forecastIncome({ runs: [run(20), run(12), run(4)], now: NOW, currentRunRealSeconds: 3600 }).hoursPerDay).toBeCloseTo(10, 9)
    expect(forecastIncome({ runs: [run(20), run(12), run(4)], now: NOW, uptimeDays: 2 }).hoursPerDay).toBeCloseTo(4.5, 9)
  })

  it('uses only the runs after the last break, and says when there are none', () => {
    const old = [run(100, { coins: 1e8 }), run(90, { coins: 1e8 }), run(80, { coins: 1e8 })]
    const after = forecastIncome({ runs: [...old, run(10, { coins: 6e8 })], now: NOW })
    expect(after.runsUsed).toBe(1)
    expect(after.coinsPerRun?.median).toBe(6e8)
    const readings = [{ at: run(70).endedAt, tier: 7, total: 30 }, { at: run(1).endedAt, tier: 7, total: 180 }]
    const stale = forecastIncome({ runs: old, now: NOW, coinBonusReadings: readings })
    expect(stale.runsUsed).toBe(3)
    expect(stale.warnings.join(' ')).toMatch(/from before the change/)
    expect(forecastIncome({ runs: [], now: NOW }).coinsPerDay).toBeNull()
  })
})

describe('affordableBy', () => {
  it('dates each item by the coins still short, at three income figures', () => {
    const items = affordableBy([{ name: 'a', coins: 5 }, { name: 'b', coins: 20 }], 10, { p25: 5, median: 10, p75: 20 }, NOW)
    expect(items[0].affordableAt.likely).toBe(NOW)
    expect(items[1].cumulativeCoins).toBe(25)
    const days = (iso: string) => (Date.parse(iso) - Date.parse(NOW)) / 86_400_000
    expect([days(items[1].affordableAt.early), days(items[1].affordableAt.likely), days(items[1].affordableAt.late)]).toEqual([0.75, 1.5, 3])
    expect(days(affordableBy([{ name: 'c', coins: 20 }], 10, { p25: 0, median: 0, p75: 0 }, NOW)[0].affordableAt.likely)).toBeGreaterThan(1e6)
  })
})

/*
 * A model run has wave coins it predicts exactly and kill coins it overstates. Here every run's
 * kill coins are a tenth of the model's, and a run's own factor (its perks) multiplies both parts.
 */
describe('measureCoinDrift', () => {
  const at = (day: number, wave: number, bonus: number, factor: number, state: 'known' | 'assumed' | 'unsettled' = 'known') => ({
    runDate: `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    wave,
    predictedWaveCoins: 10 * bonus,
    predictedKillCoins: 1000 * bonus,
    actualWaveCoins: 10 * bonus * factor,
    actual: (10 + 100) * bonus * factor,
    sources: { gt: 40 * bonus * factor },
    state,
  })
  const change = { after: '2026-11-15T00:00:00.000Z', before: '2026-11-16T00:00:00.000Z' }
  const steady = [at(1, 2000, 1, 1), at(2, 2100, 1, 1.5), at(3, 1900, 1, 1), at(4, 2000, 1, 2), at(5, 2050, 1, 1), at(6, 1950, 1, 1.5)]

  it('fits the kill-coin scale from the runs, with perks divided out', () => {
    const check = measureCoinDrift({ runs: steady, changedBetween: null })
    expect(check.calibration?.scale).toBeCloseTo(0.1, 9)
    expect(check.calibration?.waveExponent).toBeCloseTo(0, 9)
    expect(check.calibration?.runsFitted).toBe(6)
    // Calibrated, a run's ratio is its own factor: the same number its wave coins give.
    for (const run of check.perRun) expect(run.ratio).toBeCloseTo(run.waveCoinRatio as number, 9)
    expect(check.perRun.map(run => run.waveCoinRatio)).toEqual([1, 1.5, 1, 2, 1, 1.5])
    expect(check.passThrough).toBe(1)
  })

  it('finds the slope when kill coins do not grow with the wave as the model has them', () => {
    // The model's kill coins rise with the wave reached; the records' do not.
    const runs = [1000, 1500, 2000, 2500, 3000, 3500].map((wave, index) => ({
      ...at(index + 1, wave, 1, 1), predictedKillCoins: wave, actual: 10 + 100,
    }))
    const { calibration } = measureCoinDrift({ runs, changedBetween: null })
    expect(calibration?.waveExponent).toBeCloseTo(1, 9)
    expect(killCoinScaleAtWave(calibration!, 2000) * 2000).toBeCloseTo(100, 6)
    expect(killCoinScaleAtWave(calibration!, 3500) * 3500).toBeCloseTo(100, 6)
  })

  it('leaves the pass-through at 1 when the shortfall is no bigger than runs differ on their own', () => {
    // A bonus of x6 arrives in full, but the two runs after it took fewer perks than most before.
    const check = measureCoinDrift({ runs: [...steady, at(20, 2000, 6, 1), at(21, 2050, 6, 1)], changedBetween: change })
    expect(check.runToRunSpread).toBeCloseTo(1.5, 9)
    expect(check.waveCoinDrift).toBeCloseTo(1 / 1.25, 9)
    // Each run after is matched to the run before nearest in wave, which here took no perks either.
    expect(check.driftFactor).toBeCloseTo(1, 9)
    expect(check.passThrough).toBe(1)
    expect(check.warnings.join(' ')).toMatch(/within the 1\.50x by which this account's runs differ/)
  })

  it('lowers the pass-through when the shortfall is beyond that spread', () => {
    // The bonus says x6 and every run after earns as if it were x3.
    const check = measureCoinDrift({ runs: [...steady, at(20, 2000, 6, 0.5), at(21, 2050, 6, 0.5), at(22, 1950, 6, 0.5)], changedBetween: change })
    expect(check.waveCoinDrift).toBeCloseTo(0.4, 9)
    expect(check.passThrough).toBeCloseTo(0.4, 9)
    expect(check.pairs).toHaveLength(3)
    expect(check.sources[0]).toMatchObject({ source: 'gt' })
  })

  it('never pairs a run whose state is not known, and leaves an unsettled one out of the drift', () => {
    const runs = [...steady.map(run => ({ ...run, state: 'assumed' as const })), at(10, 2000, 1, 9, 'unsettled'), at(20, 2000, 6, 1)]
    const check = measureCoinDrift({ runs, changedBetween: change })
    expect(check.pairs).toEqual([])
    expect(check.driftFactor).toBeNull()
    // Assumed runs still set the wave-coin measure; the unsettled x9 does not.
    expect(check.waveCoinDrift).toBeCloseTo(1 / 1.25, 9)
    expect(measureCoinDrift({ runs: steady.slice(0, 2), changedBetween: null }).passThrough).toBe(1)
  })

  it('takes a drift at face value when there are too few runs to know the spread', () => {
    const check = measureCoinDrift({ runs: [at(1, 2000, 1, 1), at(20, 2000, 6, 0.5)], changedBetween: change })
    expect(check.runToRunSpread).toBeNull()
    expect(check.passThrough).toBeCloseTo(0.5, 9)
    expect(check.warnings.join(' ')).toMatch(/taken at face value/)
  })
})

/*
 * By hand, at 15 cells an hour for 1.5x and 100 for 2x: 1.5x costs 360 a day a slot and 2x costs
 * 2,400. With 5,000 a day and three slots: 1.5x on all three is 1,080; raising the most valuable
 * slot to 2x adds 2,040 for 3,120; raising a second would make 5,160, which is over.
 */
describe('planCellBudget', () => {
  const slot = (index: number, value?: number, extra = {}) => ({ slot: index, occupied: true, value, boost: 1, boostRemainingSeconds: 0, ...extra })
  const budget = (overrides: Partial<CellBudgetInput> = {}) => planCellBudget({
    now: NOW, cellsPerDay: { p25: 3000, median: 5000, p75: 6000 }, bank: 9000, floor: 5000,
    slots: [slot(0, 5), slot(1, 9), slot(2, 1)], cellsPerHourByMultiplier: { 1.5: 15, 2: 100, 3: 840 }, pricesVerified: true, ...overrides,
  })

  it('spends the daily income where a slot-hour is worth most', () => {
    const plan = budget()
    expect(plan.policy.map(row => row.multiplier)).toEqual([1.5, 2, 1.5])
    expect(plan.cellsPerDay).toBe(3120)
    expect(plan.netCellsPerDay).toEqual({ p25: -120, median: 1880, p75: 2880 })
  })

  it('says how long the bank lasts and what to drop when income is low', () => {
    const plan = budget()
    // At the low figure the policy runs 120 cells a day short, against 4,000 cells above the floor.
    expect(plan.daysToFloor).toEqual({ p25: 4000 / 120, median: null, p75: null })
    // With 3,000 a day the least valuable slot's 360 no longer fits beside 2x on the most valuable.
    expect(plan.fallback).toEqual(['drop slot 3 to 1x'])
    expect(budget({ bank: 4000 }).daysToFloor.p25).toBe(0)
    expect(budget({ bank: 4000 }).warnings.join(' ')).toMatch(/already below the floor/)
  })

  it('never boosts an empty slot, and warns about a boost left on one', () => {
    const plan = budget({ slots: [slot(0, 5), slot(1, 9, { occupied: false, boost: 2, boostRemainingSeconds: 3600 }), slot(2, 1)] })
    expect(plan.policy.find(row => row.slot === 1)).toEqual({ slot: 1, multiplier: 1, cellsPerDay: 0 })
    expect(plan.renewAt.map(row => row.slot)).toEqual([0, 2])
    expect(plan.warnings.join(' ')).toMatch(/slot 2 is empty with a 2x boost still on it/)
  })

  it('dates each renewal by the boost left, treats slots alike without values, and flags unverified prices', () => {
    const plan = budget({ slots: [slot(0, undefined, { boost: 2, boostRemainingSeconds: 7200 }), slot(1), slot(2)], pricesVerified: false, maxMultiplier: 1.5 })
    expect(plan.policy.map(row => row.multiplier)).toEqual([1.5, 1.5, 1.5])
    expect(plan.renewAt[0]).toEqual({ slot: 0, at: '2026-11-26T02:00:00.000Z' })
    expect(plan.renewAt[1].at).toBe(NOW)
    expect(plan.warnings.join(' ')).toMatch(/not confirmed in game/)
    expect(plan.warnings.join(' ')).toMatch(/every slot is boosted alike/)
    expect(plan.warnings.join(' ')).toMatch(/slot 1 is at 2x now; income sustains 1.5x/)
  })
})

describe('rankSpends', () => {
  const candidate = (name: string, overrides: Partial<SpendCandidate>): SpendCandidate => ({
    candidate: name, kind: 'workshop', coins: 100, gainPerDay: { low: 10, likely: 10, high: 10 }, permanent: false, confidence: null, model: 'test', ...overrides,
  })

  it('keeps labs and coin buys on separate queues, each by what limits it', () => {
    const ranking = rankSpends([
      candidate('slow lab', { kind: 'lab', coins: 1, slotHours: 200, permanent: true }),
      candidate('quick lab', { kind: 'lab', coins: 1e9, slotHours: 20, permanent: true }),
      candidate('dear buy', { coins: 1000 }),
      candidate('cheap buy', { coins: 10 }),
    ])
    // The quick lab costs a billion times the coins and still ranks first: slot time is what a lab spends.
    expect(ranking.labQueue.map(row => row.candidate)).toEqual(['quick lab', 'slow lab'])
    expect(ranking.coinQueue.map(row => row.candidate)).toEqual(['cheap buy', 'dear buy'])
    expect(ranking.labQueue[0].gainPerSlotHour).toBe(0.5)
    expect(ranking.coinQueue[0]).toMatchObject({ gainPerCoin: 1, paybackDays: 1, gainPerSlotHour: null })
    expect([...ranking.labQueue, ...ranking.coinQueue]).toHaveLength(4)
  })

  it('never ranks a gated buy above the same buy with its gate paid', () => {
    const gate = { name: 'a lab', coins: 900, slotHours: 74 }
    const ranking = rankSpends([candidate('gated', { gates: [gate] }), candidate('open', {}), candidate('middle', { coins: 500 })])
    expect(ranking.coinQueue.map(row => row.candidate)).toEqual(['open', 'middle', 'gated'])
    expect(ranking.coinQueue[2]).toMatchObject({ totalCoins: 1000, totalSlotHours: 74, paybackDays: 100 })
  })

  it('says when two neighbours cannot be told apart, and puts what adds nothing last', () => {
    const ranking = rankSpends([
      candidate('wide', { gainPerDay: { low: 2, likely: 12, high: 20 } }),
      candidate('narrow', { gainPerDay: { low: 9, likely: 10, high: 11 } }),
      candidate('clear loser', { gainPerDay: { low: 1, likely: 1, high: 1 } }),
      candidate('nothing', { gainPerDay: { low: 0, likely: 0, high: 0 } }),
    ], [{ candidate: 'left out', reason: 'no model' }])
    expect(ranking.coinQueue.map(row => row.candidate)).toEqual(['wide', 'narrow', 'clear loser', 'nothing'])
    expect(ranking.coinQueue[0].overlaps).toEqual(['narrow'])
    expect(ranking.coinQueue[1].overlaps).toEqual(['wide'])
    expect(ranking.coinQueue[2].overlaps).toEqual([])
    expect(ranking.coinQueue[3].paybackDays).toBeNull()
    expect(ranking.notRanked).toEqual([{ candidate: 'left out', reason: 'no model' }])
    expect(ranking.warnings).toHaveLength(1)
  })
})

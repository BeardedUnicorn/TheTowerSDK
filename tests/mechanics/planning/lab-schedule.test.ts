import { describe, expect, it } from 'vitest'
import { labCoinCostToReachLevel, labDurationDaysToReachLevel, labSpeedTotal } from '../../../src/mechanics/effective-paths/lab-costs'
import { scheduleLabs } from '../../../src/mechanics/planning'
import type { LabScheduleInput } from '../../../src/mechanics/planning'

const NOW = '2026-11-26T00:00:00.000Z'
const HOUR = 3600

function input(overrides: Partial<LabScheduleInput> = {}): LabScheduleInput {
  return {
    now: NOW,
    slots: [{ slot: 0, running: { lab: 'golden_tower_bonus', name: 'Golden Tower Bonus', toLevel: 14, remainingSeconds: 10 * HOUR }, boost: 1, boostRemainingSeconds: 0 }],
    queue: [],
    labLevels: {},
    labSpeedLevel: 0,
    labSpeedRelicFraction: 0,
    coinDiscountLevel: 0,
    balance: 1e12,
    coinsPerDay: 0,
    horizonDays: 3,
    ...overrides,
  }
}
const hoursFromNow = (iso: string) => (Date.parse(iso) - Date.parse(NOW)) / 3_600_000

describe('scheduleLabs', () => {
  it('finishes a running lab after its remaining time, halved by a 2x boost while it lasts', () => {
    expect(hoursFromNow(scheduleLabs(input()).rows[0].finish)).toBeCloseTo(10, 6)
    const boosted = scheduleLabs(input({ slots: [{ ...input().slots[0], boost: 2, boostRemainingSeconds: 4 * HOUR }] }))
    // Four boosted hours do eight hours of work; the last two run unboosted.
    expect(hoursFromNow(boosted.rows[0].finish)).toBeCloseTo(6, 6)
    const kept = scheduleLabs(input({ slots: [{ ...input().slots[0], boost: 2, boostRemainingSeconds: 4 * HOUR }], boostPolicy: [{ slot: 0, multiplier: 2 }] }))
    expect(hoursFromNow(kept.rows[0].finish)).toBeCloseTo(5, 6)
  })

  it('goes on with the next level of the same lab, at the catalog\'s price and time', () => {
    const { rows } = scheduleLabs(input())
    expect(rows.map(row => `${row.lab} ${row.toLevel}`)).toEqual(['Golden Tower Bonus 14', 'Golden Tower Bonus 15'])
    expect(rows[1].start).toBe(rows[0].finish)
    expect(rows[1].coinsNeeded).toBe(labCoinCostToReachLevel('golden_tower_bonus', 15, {}))
    expect(hoursFromNow(rows[1].finish) - 10).toBeCloseTo((labDurationDaysToReachLevel('golden_tower_bonus', 15, {}) ?? 0) * 24, 5)
    expect(scheduleLabs(input({ continueFinishedLabs: false })).rows).toHaveLength(1)
  })

  it('takes the queue in order, and a level only once the one below is held', () => {
    const queue = [
      { lab: 'coins_kill_bonus', toLevel: 66 },
      { lab: 'coins_kill_bonus', toLevel: 65 },
      { lab: 'spotlight_coin_bonus', toLevel: 13 },
    ]
    const { rows } = scheduleLabs(input({ queue, labLevels: { coins_kill_bonus: 64, spotlight_coin_bonus: 12 }, horizonDays: 60 }))
    const started = rows.filter(row => row.start !== null).map(row => `${row.lab} ${row.toLevel}`)
    expect(started.slice(0, 3)).toEqual(['coins_kill_bonus 65', 'coins_kill_bonus 66', 'spotlight_coin_bonus 13'])
  })

  it('makes a slot wait for coins and says how long and why', () => {
    const cost = labCoinCostToReachLevel('golden_tower_bonus', 15, {}) as number
    const short = scheduleLabs(input({ balance: 0, coinsPerDay: cost / 2, horizonDays: 5 }))
    const waited = short.rows[1]
    // Coins arrive at half the cost a day, so the cost is reached two days in: 38 hours after the slot freed.
    expect(hoursFromNow(waited.start as string)).toBeCloseTo(48, 3)
    expect(waited.shortfall?.waitSeconds).toBeCloseTo(38 * HOUR, 0)
    expect(waited.shortfall?.coins).toBeCloseTo(cost - (cost / 2) * (10 / 24), 0)
    expect(waited.balanceWhenSlotFreed).toBeCloseTo((cost / 2) * (10 / 24), 0)
    const never = scheduleLabs(input({ balance: 0, coinsPerDay: 0 }))
    expect(never.rows).toHaveLength(1)
    expect(never.warnings.join(' ')).toMatch(/no income is forecast/)
  })

  it('lets a cheaper lab in another slot start while one waits', () => {
    const queue = [{ lab: 'golden_tower_duration', toLevel: 17 }, { lab: 'coins_kill_bonus', toLevel: 65 }]
    const dear = labCoinCostToReachLevel('golden_tower_duration', 17, {}) as number
    const cheap = labCoinCostToReachLevel('coins_kill_bonus', 65, {}) as number
    expect(cheap).toBeLessThan(dear)
    const schedule = scheduleLabs(input({
      slots: [{ slot: 0, running: null, boost: 1, boostRemainingSeconds: 0 }, { slot: 1, running: null, boost: 1, boostRemainingSeconds: 0 }],
      queue, labLevels: { golden_tower_duration: 16, coins_kill_bonus: 64 }, balance: cheap, coinsPerDay: dear, continueFinishedLabs: false,
    }))
    const byLab = new Map(schedule.rows.map(row => [row.lab, row]))
    expect(byLab.get('coins_kill_bonus')?.start).toBe(NOW)
    expect(byLab.get('golden_tower_duration')?.shortfall).toBeDefined()
    expect(byLab.get('golden_tower_duration')?.slot).toBe(0)
  })

  it('speeds every slot up from the moment a Labs Speed level lands', () => {
    const slots = [
      { slot: 0, running: { lab: 'labs_speed', toLevel: 55, remainingSeconds: 10 * HOUR }, boost: 1, boostRemainingSeconds: 0 },
      { slot: 1, running: { lab: 'golden_tower_bonus', toLevel: 14, remainingSeconds: 20 * HOUR }, boost: 1, boostRemainingSeconds: 0 },
    ]
    const { rows } = scheduleLabs(input({ slots, labSpeedLevel: 54, continueFinishedLabs: false }))
    const ratio = labSpeedTotal(55) / labSpeedTotal(54)
    expect(hoursFromNow(rows.find(row => row.lab === 'golden_tower_bonus')!.finish)).toBeCloseTo(10 + 10 / ratio, 6)
  })

  it('carries a boost over to the next lab in the slot', () => {
    const { rows } = scheduleLabs(input({ slots: [{ ...input().slots[0], boost: 2, boostRemainingSeconds: 1000 * HOUR }], horizonDays: 1 }))
    expect(rows[1].boost).toBe(2)
    expect(hoursFromNow(rows[1].start as string)).toBeCloseTo(5, 6)
  })

  it('warns when a boost would run down on an empty slot', () => {
    const waiting = scheduleLabs(input({ slots: [{ ...input().slots[0], boost: 2, boostRemainingSeconds: 100 * HOUR }], balance: 0, coinsPerDay: 1 }))
    expect(waiting.warnings.join(' ')).toMatch(/2x boost has \d+ h left, which run down on an empty slot/)
    const idle = scheduleLabs(input({ slots: [{ ...input().slots[0], boost: 2, boostRemainingSeconds: 100 * HOUR }], continueFinishedLabs: false }))
    expect(idle.warnings.join(' ')).toMatch(/slot 1 has nothing to research .* 2x boost left to run down unused/)
  })

  it('proposes a swap when a waiting lab is worth far more than a running one, and makes none on its own', () => {
    const slots = [{ slot: 0, running: { lab: 'labs_coin_discount', name: 'Labs Coin Discount', toLevel: 44, remainingSeconds: 100 * HOUR, gainPerSlotHour: 10 }, boost: 1, boostRemainingSeconds: 0 }]
    const queue = [{ lab: 'golden_tower_duration', name: 'Golden Tower Duration', toLevel: 17, gainPerSlotHour: 100 }]
    const schedule = scheduleLabs(input({ slots, queue, labLevels: { golden_tower_duration: 16 } }))
    expect(schedule.swaps).toEqual([expect.objectContaining({ slot: 0, stop: 'Labs Coin Discount', start: 'Golden Tower Duration', startLevel: 17 })])
    expect(schedule.rows[0].lab).toBe('Labs Coin Discount')
    const close = scheduleLabs(input({ slots, queue: [{ ...queue[0], gainPerSlotHour: 20 }], labLevels: { golden_tower_duration: 16 } }))
    expect(close.swaps).toEqual([])
  })

  it('writes local times in the zone asked for, and says when it fell back to UTC', () => {
    expect(scheduleLabs(input({ timeZone: 'America/Denver' })).rows[0].finishLocal).toBe('Thu, Nov 26, 3:00 AM MST')
    const utc = scheduleLabs(input())
    expect(utc.rows[0].finishLocal).toBe('Thu, Nov 26, 10:00 AM UTC')
    expect(utc.warnings.join(' ')).toMatch(/no time zone was given/)
    const bad = scheduleLabs(input({ timeZone: 'Mars/Olympus' }))
    expect(bad.rows[0].finishLocal).toBeNull()
    expect(bad.warnings.join(' ')).toMatch(/not one this runtime knows/)
  })
})

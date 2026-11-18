import { describe, expect, it } from 'vitest'
import { computeBotDurationSecondsAtLevel } from '../../src/mechanics/bots/compute'
import { computeDurations } from '../../src/mechanics/uptime/compute'
import type { UptimeCoreState } from '../../src/mechanics/uptime/types'

/**
 * Uptime reports the same Thunder Bot duration as the bot ladder.
 *
 * The ladder was corrected to half a second per level. Uptime kept its own copy of the old
 * whole-second formula, so the two disagreed at every level from 1 to 19.
 */
describe('Thunder Bot duration in uptime', () => {
  for (const level of [0, 1, 4, 10, 15, 20]) {
    it(`matches the bot ladder at level ${level}`, () => {
      const durations = computeDurations({ tbDurLevel: level } as UptimeCoreState)
      expect(durations.tb).toBe(computeBotDurationSecondsAtLevel('tb', level, 0))
    })
  }

  it('climbs half a second per level to 15 seconds at level 20', () => {
    expect(computeDurations({ tbDurLevel: 0 } as UptimeCoreState).tb).toBe(5)
    expect(computeDurations({ tbDurLevel: 10 } as UptimeCoreState).tb).toBe(10)
    expect(computeDurations({ tbDurLevel: 20 } as UptimeCoreState).tb).toBe(15)
  })
})

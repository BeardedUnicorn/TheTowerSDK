import { describe, expect, it } from 'vitest'
import { readToolExportJson } from '../../src/save/access/json'
import { readLabsFromSaveRoot } from '../../src/save/labs/read'

/*
 * A lab slot with a speed-up finishes sooner than the game's own date says.
 *
 * The stored finish date is worked out at the slot's normal rate: on two v29.2 exports 4.9 hours
 * apart, every slot at 2x had its date move 4.9 hours earlier and the slot at 1.5x half that. So
 * `research.remainingSeconds` is the time left at the normal rate, and
 * `remainingSecondsWithSpeedUp` is the real time left. The remaining-at-normal-rate figures and
 * speed-ups below are the ones that export held; the expected values are worked by hand.
 */
const EXPORTED_AT = '2026-11-24T11:38:38.000Z'
const at = (seconds: number) => new Date(Date.parse(EXPORTED_AT) + seconds * 1000).toISOString()

const COMPLETE_DATES: Record<number, string> = {
  22: at(642_589), // Coins / Kill Bonus, 2x for 68,114 s more
  23: at(9_496), // Coins / Wave, 2x for 21,252 s more
  36: at(509_869), // Labs Speed, 1.5x for 68,724 s more
  60: at(468_944), // Golden Tower Bonus, a 2x that has run out
}

function exportWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const json = {
    ExportVersion: 1,
    ExportedAt: EXPORTED_AT,
    VersionNumber: 1296,
    DataVersion: 35,
    ResearchLevel: Array.from({ length: 260 }, () => 1),
    ResearchPercentComplete: Array.from({ length: 260 }, () => 0),
    ResearchCompleteDate: Array.from({ length: 260 }, (_, index) => COMPLETE_DATES[index] ?? '0001-01-01T00:00:00.000Z'),
    LabsUnlocked: 4,
    LabLevel: [0, 0, 0, 0, 0],
    LabResearchInt: [36, 22, 23, 60, -1],
    LabActiveBool: [true, true, true, true, false],
    LabSpeedUpSpeed: [1.5, 2, 2, 2, 1],
    LabSpeedUpRemainingSeconds: [68_724, 68_114, 21_252, 0, 0],
    CompletedLabs: [],
    ...overrides,
  }
  return readToolExportJson(new TextEncoder().encode(JSON.stringify(json)))!
}

describe('lab slot speed-ups', () => {
  const queue = readLabsFromSaveRoot(exportWith())!.activeQueue

  it('keeps the game\'s own remaining time, at the normal rate', () => {
    expect(queue.map(slot => slot.research?.remainingSeconds ?? null)).toEqual([509_869, 642_589, 9_496, 468_944, null])
  })

  it('finishes a level the speed-up outlasts in remaining ÷ speed', () => {
    // 9,496 s of research at 2x takes 4,748 s; the 21,252 s left on the speed-up covers it.
    expect(queue[2].remainingSecondsWithSpeedUp).toBe(4_748)
  })

  it('runs the rest at the normal rate once the speed-up ends', () => {
    // 68,114 s at 2x does 136,228 s of research; the other 506,361 s run at 1x.
    expect(queue[1].remainingSecondsWithSpeedUp).toBe(574_475)
    // 68,724 s at 1.5x does 103,086 s; the other 406,783 s run at 1x.
    expect(queue[0].remainingSecondsWithSpeedUp).toBe(475_507)
  })

  it('applies nothing once the speed-up has run out, even with a multiplier still stored', () => {
    expect(queue[3].speedUp).toBe(2)
    expect(queue[3].remainingSecondsWithSpeedUp).toBe(468_944)
  })

  it('has no real time left for an empty slot', () => {
    expect(queue[4].research).toBeNull()
    expect(queue[4].remainingSecondsWithSpeedUp).toBeNull()
  })
})

describe('the lab completion log', () => {
  it('keeps the logged order and the logged dates, even one later than the export', () => {
    /*
     * As one v29.2 export held it, written at 20:32 on the 23rd: Spotlight Coin Bonus 11 logged
     * for 08:55 the next morning, with level 12 already in progress, and the entry after it dated
     * earlier. Sorting by date, or dropping a date past the export, would both misreport it.
     */
    const labs = readLabsFromSaveRoot(exportWith({
      ExportedAt: '2026-11-23T20:32:03.000Z',
      CompletedLabs: [
        { dateCompleted: '2026-11-24T08:55:40.383Z', labNumber: 97, level: 11 },
        { dateCompleted: '2026-11-24T04:45:23.539Z', labNumber: 22, level: 63 },
      ],
    }))!
    expect(labs.completions).toEqual([
      { researchIndex: 97, level: 11, completedAt: '2026-11-24T08:55:40.383Z' },
      { researchIndex: 22, level: 63, completedAt: '2026-11-24T04:45:23.539Z' },
    ])
  })

  it('reads the slot count as stored: bought slots, not counting the free first one', () => {
    expect(readLabsFromSaveRoot(exportWith())!.labsUnlocked).toBe(4)
  })
})

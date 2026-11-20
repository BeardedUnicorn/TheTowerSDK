import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { findLabResearchBySlug } from '../../src/data/labs/research'
import { labDurationDaysToReachLevel } from '../../src/mechanics/effective-paths/lab-costs'
import { readLabsFromSaveRoot } from '../../src/save/labs/read'
import { estimateLabLevelRemainingSeconds, getStaticLabWorkingLevelDurationHours } from '../../src/save/labs/remaining'

const lab = LAB_CATALOG.find(entry => entry.name === 'Game Speed')!
const maxLevel = Math.max(...lab.levels.map(entry => entry.level))

describe('time left on a lab', () => {
  it('has no next level to time once the lab is maxed', () => {
    expect(getStaticLabWorkingLevelDurationHours(lab.name, maxLevel)).toBeNull()
    expect(estimateLabLevelRemainingSeconds(lab.name, maxLevel, 0)).toBeNull()
  })

  it('still times the last level while it is being researched', () => {
    expect(getStaticLabWorkingLevelDurationHours(lab.name, maxLevel - 1)).toBeGreaterThan(0)
    expect(estimateLabLevelRemainingSeconds(lab.name, maxLevel - 1, 0.5)).toBeGreaterThan(0)
  })
})

/**
 * Measured on a real v29.2.1 export (build 1294), with Labs Speed 53 -> 54 in progress.
 *
 * The game's own `researchCompleteDate` put 222,263 seconds on it at 73.7787962% complete, which
 * is 9.8107 days for the whole level. The catalog's unmodified time for level 54 is 20.513 days,
 * and 20.513 / (1 + 0.02 * 53) / 1.015 is 9.8108 -- the Labs Speed research at 53 and one +1.5%
 * relic. Four other labs in progress on the same export fit the same formula to four digits.
 *
 * The reader left Labs Speed out of its own research, following a wiki sentence the game does not
 * agree with, and never read the relics at all. It reported 464,732 seconds for this row.
 */
const LABS_SPEED_LEVEL = 53
const LABS_SPEED_PERCENT_COMPLETE = 0.737787962
const GAME_REMAINING_SECONDS = 222_263
const ANCIENT_TOME_RELIC_INDEX = 38
const ANCIENT_TOME_LAB_SPEED = 0.015

describe('lab speed on a lab in progress', () => {
  it('applies the Labs Speed research to the Labs Speed lab itself', () => {
    const base = getStaticLabWorkingLevelDurationHours('Labs Speed', LABS_SPEED_LEVEL)!
    const sped = getStaticLabWorkingLevelDurationHours('Labs Speed', LABS_SPEED_LEVEL, LABS_SPEED_LEVEL)!

    expect(sped).toBeCloseTo(base / (1 + 0.02 * LABS_SPEED_LEVEL), 6)
  })

  it('applies relic lab speed on top of the research', () => {
    const withoutRelic = getStaticLabWorkingLevelDurationHours('Labs Speed', LABS_SPEED_LEVEL, LABS_SPEED_LEVEL)!
    const withRelic = getStaticLabWorkingLevelDurationHours(
      'Labs Speed', LABS_SPEED_LEVEL, LABS_SPEED_LEVEL, ANCIENT_TOME_LAB_SPEED,
    )!

    expect(withRelic).toBeCloseTo(withoutRelic / (1 + ANCIENT_TOME_LAB_SPEED), 6)
  })

  it('answers what the lab-time calculator answers, for every lab', () => {
    for (const entry of LAB_CATALOG) {
      const hours = getStaticLabWorkingLevelDurationHours(entry.name, 0, 30, 0.1)
      const days = labDurationDaysToReachLevel(entry.slug, 1, { labSpeedLabLevel: 30, labSpeedRelicPct: 0.1 })
      if (hours === null) continue
      expect(hours, entry.name).toBeCloseTo(days! * 24, 6)
    }
  })

  it('matches the time the game put on a real Labs Speed research', () => {
    const seconds = estimateLabLevelRemainingSeconds(
      'Labs Speed', LABS_SPEED_LEVEL, LABS_SPEED_PERCENT_COMPLETE, LABS_SPEED_LEVEL, ANCIENT_TOME_LAB_SPEED,
    )!

    expect(Math.abs(seconds - GAME_REMAINING_SECONDS) / GAME_REMAINING_SECONDS).toBeLessThan(0.001)
  })

  it('reads the research level and the relics from the save on its own', () => {
    const labsSpeedIndex = findLabResearchBySlug('labs_speed')!.index
    const researchLevel = Array.from({ length: 260 }, () => 0)
    const researchPercentComplete = Array.from({ length: 260 }, () => 0)
    researchLevel[labsSpeedIndex] = LABS_SPEED_LEVEL
    researchPercentComplete[labsSpeedIndex] = LABS_SPEED_PERCENT_COMPLETE
    const relicsUnlocked = Array.from({ length: 350 }, () => 0)
    relicsUnlocked[ANCIENT_TOME_RELIC_INDEX] = 2

    const labs = readLabsFromSaveRoot({ researchLevel, researchPercentComplete, relicsUnlocked })!
    const row = labs.researches.find(research => research.index === labsSpeedIndex)!

    expect(Math.abs(row.remainingSeconds! - GAME_REMAINING_SECONDS) / GAME_REMAINING_SECONDS).toBeLessThan(0.001)
  })
})

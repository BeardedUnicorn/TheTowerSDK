import { describe, expect, it } from 'vitest'
import { computeLabRushGems } from '../../src/data/labs/overview'
import { readToolExportJson } from '../../src/save/access/json'
import { computeLabResearchLevelMax, readLabsFromSaveRoot } from '../../src/save/labs/read'
import { readUltimateWeaponsFromSaveRoot } from '../../src/save/ultimate-weapons/read'
import { readWorkshopUnlocksFromSaveRoot } from '../../src/save/workshop/unlocks'

/*
 * What a save says the next purchase on three screens costs, against what v29.2.2 showed on
 * 2026-11-24 (facts/v29.2.2/live-ui-check.json): "Unlock Rend Armor 500.00B" and "Unlock The Wall
 * 500.00M" with attack flags 0-4 and defense flags 0-7 set, "New Ultimate Weapon 1750" with six
 * weapons owned, and the five Rush buttons on an account with 19 fully researched labs.
 */

const flags = (length: number, setBelow: number): boolean[] => Array.from({ length }, (_, index) => index < setBelow)

describe('the next workshop unlock, from the save\'s unlock flags', () => {
  const unlocks = readWorkshopUnlocksFromSaveRoot({
    upgradeTierUnlocked: flags(12, 5),
    upgradeDefenseTierUnlocked: flags(12, 8),
    upgradeUtilityTierUnlocked: flags(12, 6),
  })!

  it('offers Rend Armor on the attack tab at 500.00B, as the screen did', () => {
    expect(unlocks.nextUnlock.attack).toMatchObject({ stats: ['Rend Armor Chance', 'Rend Armor Mult'], coins: 500_000_000_000 })
  })

  it('offers The Wall on the defense tab at 500.00M, as the screen did', () => {
    expect(unlocks.nextUnlock.defense).toMatchObject({ stats: ['Wall Health', 'Wall Rebuild'], coins: 500_000_000 })
  })

  it('has nothing to offer on a tab whose every group is bought', () => {
    const all = readWorkshopUnlocksFromSaveRoot({ upgradeTierUnlocked: flags(40, 40) })!
    expect(all.nextUnlock.attack).toBeNull()
  })
})

describe('the next ultimate weapon and plus, from the save\'s unlock flags', () => {
  it('prices the seventh weapon at 1750 stones with six owned, as the screen did', () => {
    const weapons = readUltimateWeaponsFromSaveRoot({
      ultimateWeaponUnlocked: flags(9, 6),
      ultimateWeaponPlusUnlocked: flags(9, 0),
    })!
    expect(weapons).toMatchObject({
      ownedCount: 6,
      nextUnlockStoneCost: 1750,
      allWeaponsOwned: false,
      plusOwnedCount: 0,
      nextPlusUnlockStoneCost: 500,
    })
  })

  it('has no next weapon once all nine are owned, and prices the plus by pluses owned', () => {
    const weapons = readUltimateWeaponsFromSaveRoot({
      ultimateWeaponUnlocked: flags(9, 9),
      ultimateWeaponPlusUnlocked: flags(9, 3),
    })!
    expect(weapons).toMatchObject({
      ownedCount: 9,
      nextUnlockStoneCost: null,
      allWeaponsOwned: true,
      plusOwnedCount: 3,
      nextPlusUnlockStoneCost: 975,
    })
  })

  it('does not price from a list it could not read, rather than counting the rest', () => {
    const weapons = readUltimateWeaponsFromSaveRoot({ ultimateWeaponUnlocked: [true, 'yes', false] })!
    expect(weapons.ownedCount).toBeNull()
    expect(weapons.nextUnlockStoneCost).toBeNull()
    expect(weapons.warnings.join(' ')).toContain('ultimateWeaponUnlocked has unreadable entries')
  })

  it('knows nothing about ownership when the save has no unlock list', () => {
    const weapons = readUltimateWeaponsFromSaveRoot({ ultimateWeaponsSystemUnlocked: true })!
    expect(weapons).toMatchObject({ ownedCount: null, nextUnlockStoneCost: null, allWeaponsOwned: null })
  })
})

describe('the Rush button on each running lab', () => {
  /*
   * The five labs as the lab screen showed them, with the time left exactly as the screen read it
   * — the same unit the save stores, at the slot's normal rate.
   */
  const RUNNING = [
    { index: 36, level: 54, remaining: 521_805, shownRush: 674 }, // Labs Speed, 6d 0h 56m 45s
    { index: 97, level: 11, remaining: 243_601, shownRush: 324 }, // Spotlight Coin Bonus, 2d 19h 40m 1s
    { index: 60, level: 13, remaining: 484_842, shownRush: 627 }, // Golden Tower Bonus, 5d 14h 40m 42s
    { index: 22, level: 63, remaining: 658_487, shownRush: 832 }, // Coins / Kill Bonus, 7d 14h 54m 47s
    { index: 23, level: 57, remaining: 25_394, shownRush: 38 }, // Coins / Wave, 7h 3m 14s
  ]
  const EXPORTED_AT = '2026-11-24T09:30:00.000Z'
  const at = (seconds: number) => new Date(Date.parse(EXPORTED_AT) + seconds * 1000).toISOString()

  /* Nineteen other labs at their last level, as on the account the screens were read from. */
  const running = new Set(RUNNING.map(lab => lab.index))
  const maxed = Array.from({ length: 260 }, (_, index) => index)
    .filter(index => !running.has(index) && computeLabResearchLevelMax(index) > 1)
    .slice(0, 19)
  const levels = Array.from({ length: 260 }, (_, index) =>
    maxed.includes(index) ? computeLabResearchLevelMax(index) : RUNNING.find(lab => lab.index === index)?.level ?? 0)
  const dates = Array.from({ length: 260 }, (_, index) => {
    const lab = RUNNING.find(entry => entry.index === index)
    return lab ? at(lab.remaining) : '0001-01-01T00:00:00.000Z'
  })

  const exportWith = (overrides: Record<string, unknown> = {}) => readToolExportJson(new TextEncoder().encode(JSON.stringify({
    ExportVersion: 1,
    ExportedAt: EXPORTED_AT,
    VersionNumber: 1296,
    DataVersion: 35,
    ResearchLevel: levels,
    ResearchPercentComplete: Array.from({ length: 260 }, () => 0),
    ResearchCompleteDate: dates,
    LabsUnlocked: 4,
    LabLevel: [0, 0, 0, 0, 0],
    LabResearchInt: RUNNING.map(lab => lab.index),
    LabActiveBool: [true, true, true, true, true],
    LabSpeedUpSpeed: [1.5, 2, 2, 2, 2],
    LabSpeedUpRemainingSeconds: [76_000, 54_000, 75_000, 76_000, 29_000],
    CompletedLabs: [],
    ...overrides,
  })))!

  const labs = readLabsFromSaveRoot(exportWith())!

  it('counts the nineteen maxed labs the Labs panel showed as Gem Rush Efficiency 1.285x', () => {
    expect(labs.maxedCount).toBe(19)
    expect(labs.gemRushEfficiency).toBeCloseTo(1.285, 12)
  })

  it('asks for the gems each Rush button showed', () => {
    expect(labs.activeQueue.map(slot => slot.rushGems)).toEqual(RUNNING.map(lab => lab.shownRush))
  })

  it('prices the time at the normal rate, which the speed-up does not shorten', () => {
    const slot = labs.activeQueue[0]
    expect(slot.remainingSecondsWithSpeedUp).toBeLessThan(slot.research!.remainingSeconds!)
    expect(slot.rushGems).toBe(computeLabRushGems(slot.research!.remainingSeconds! / 3600, 19))
  })

  it('has nothing to rush in an idle slot', () => {
    const idle = readLabsFromSaveRoot(exportWith({ LabActiveBool: [false, true, true, true, true] }))!
    expect(idle.activeQueue[0].rushGems).toBeNull()
    expect(idle.activeQueue[1].rushGems).toBe(324)
  })
})

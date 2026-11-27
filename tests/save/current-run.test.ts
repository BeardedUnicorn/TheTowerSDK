import { describe, expect, it } from 'vitest'
import { readCurrentRunFromSaveRoot, readCurrentRunProgressFromSaveRoot, readInRunLevelsFromSaveRoot } from '../../src/save'

describe('current-run save fields', () => {
  it('reads current arrays independently of purchased levels', () => {
    const result = readCurrentRunFromSaveRoot({ currentWave: 123, currentTier: 7,
      upgradeLevel: [100, 200], upgradeDefenseLevel: [300], upgradeUtilityLevel: [400],
      upgradeWorkshopLevel: [1], upgradeWorkshopDefenseLevel: [2] })
    expect(result?.upgradeLevel).toEqual([100, 200])
    expect(result?.upgradeDefenseLevel).toEqual([300])
    expect(result?.currentWave).toBe(123)
    expect(result?.unreadableKeys).toEqual([])
  })
  it('preserves array positions, extra slots and unknown integers', () => {
    const result = readCurrentRunFromSaveRoot({ upgradeLevel: [0, '1', null, -1, 1.5, 42] })
    expect(result?.upgradeLevel).toEqual([0, null, null, null, null, 42])
    expect(result?.upgradeDefenseLevel).toBeNull()
    expect(result?.currentWave).toBeNull()
  })
  it('does not fall back to workshop or invent an attack alias', () => {
    expect(readCurrentRunFromSaveRoot({ upgradeAttackLevel: [7], upgradeWorkshopLevel: [8] })?.upgradeLevel).toBeNull()
    expect(readCurrentRunFromSaveRoot(null)).toBeNull()
  })
})

/*
 * The spec's two exports of one tier-7 account. At wave 532 the defense levels stood 382 above
 * the workshop and 382 free defense upgrades had landed: nothing bought. By wave 1,260 Health
 * was 2,082 against a workshop 1,300 and Recovery Amount 235 against 35: cash had been spent.
 */
describe('named in-run levels', () => {
  const workshop = { upgradeWorkshopLevel: [805], upgradeWorkshopDefenseLevel: [1300, 0, 99], upgradeWorkshopUtilityLevel: [149, 149, 149, 149, 99, 99, 99, 99, 35] }
  const run = (extra: Record<string, unknown>) => readInRunLevelsFromSaveRoot({ currentTier: 7, roundActiveBool: true, ...workshop, ...extra })

  it('calls a run AFK when free upgrades account for every level gained', () => {
    const afk = run({ currentWave: 532, upgradeLevel: [1425], upgradeDefenseLevel: [1395 + 182, 105, 99],
      upgradeUtilityLevel: [149, 149, 149, 149, 99, 99, 99, 99, 35],
      freeAttackUpgradesThisRound: 620, freeDefenseUpgradesThisRound: 382, freeUtilityUpgradesThisRound: 0 })
    expect(afk?.mode).toBe('afk')
    expect(afk?.categories.find(tab => tab.category === 'defense')).toMatchObject({ gained: 382, fromFree: 382, bought: 0 })
    expect(afk?.rows.find(row => row.stat === 'Health')).toMatchObject({ workshop: 1300, inRun: 1577, fromFree: 277, bought: 0 })
  })

  it('calls a run active once levels outnumber the free upgrades', () => {
    const active = run({ currentWave: 1260, upgradeLevel: [2000], upgradeDefenseLevel: [2082, 0, 99],
      upgradeUtilityLevel: [149, 149, 149, 149, 99, 99, 99, 99, 235],
      freeAttackUpgradesThisRound: 1195, freeDefenseUpgradesThisRound: 700, freeUtilityUpgradesThisRound: 0 })
    expect(active?.mode).toBe('active')
    expect(active?.categories.find(tab => tab.category === 'defense')?.bought).toBe(82)
    expect(active?.rows.find(row => row.stat === 'Recovery Amount')).toMatchObject({ workshop: 35, inRun: 235, fromFree: 0, bought: 200 })
    // Free and bought levels share the defense tab, so no single stat's split is known.
    expect(active?.rows.find(row => row.stat === 'Health')).toMatchObject({ gained: 782, fromFree: null, bought: null })
  })

  it('falls back to lifetime counters, and trusts them only from the run\'s start', () => {
    const levels = { currentWave: 532, upgradeLevel: [805], upgradeDefenseLevel: [1682, 0, 99], upgradeUtilityLevel: [149] }
    const totals = { totalFreeAttackUpgrades: 10, totalFreeDefenseUpgrades: 1382, totalFreeUtilityUpgrades: 10 }
    const before = { attack: 10, defense: 1000, utility: 10 }
    expect(readInRunLevelsFromSaveRoot({ ...workshop, ...levels, ...totals }, { lifetimeFree: before, atRunStart: true })?.mode).toBe('afk')
    expect(readInRunLevelsFromSaveRoot({ ...workshop, ...levels, ...totals }, { lifetimeFree: before, atRunStart: false })?.mode).toBe('unknown')
    expect(readInRunLevelsFromSaveRoot({ ...workshop, ...levels, ...totals }, { lifetimeFree: { ...before, defense: 1100 }, atRunStart: false })?.mode).toBe('active')
    expect(readInRunLevelsFromSaveRoot({ ...workshop, ...levels })?.mode).toBe('unknown')
    expect(run({ currentWave: 0, upgradeLevel: [900], upgradeDefenseLevel: [1300], upgradeUtilityLevel: [149], freeAttackUpgradesThisRound: 0, freeDefenseUpgradesThisRound: 0, freeUtilityUpgradesThisRound: 0 })?.mode).toBe('unknown')
  })
})

describe('current-run progress', () => {
  it('dates the start from the run\'s own real time', () => {
    const progress = readCurrentRunProgressFromSaveRoot({ currentTier: 7, currentWave: 532, exportedAt: '2026-11-26T20:34:28.974Z',
      exportVersion: 1, realTimeThisRound: 3374, gameplayTimeThisRound: 13496, coinsEarnedThisRound: 3e8, cellsEarnedThisRound: 16 })
    expect(progress).toMatchObject({ tier: 7, wave: 532, startedAt: '2026-11-26T19:38:14.974Z', realSeconds: 3374, gameSeconds: 13496,
      coinsSoFar: 3e8, cellsSoFar: 16, source: 'save' })
  })

  it('derives the time from an earlier export when the save does not count it', () => {
    const root = { currentTier: 7, currentWave: 532, exportedAt: '2026-11-26T20:34:28.974Z', exportVersion: 1, playTime: 7_900_000 + 3374 }
    const progress = readCurrentRunProgressFromSaveRoot(root, { exportedAt: '2026-11-26T19:38:15.354Z', playTimeSeconds: 7_900_000 })
    expect(progress).toMatchObject({ realSeconds: 3374, coinsSoFar: null, source: 'history' })
    expect(progress?.warnings).toHaveLength(1)
    expect(readCurrentRunProgressFromSaveRoot(root)).toMatchObject({ realSeconds: null, startedAt: null, source: null })
  })
})

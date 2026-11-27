import { describe, expect, it } from 'vitest'
import {
  buildExportSnapshot,
  buildExportTimeline,
  diffExportSnapshots,
  exportChangesDuring,
  exportStateAt,
  isExportSnapshot,
  orderExportSnapshots,
  resolveExportRunModes,
  resolveInRunLevels,
  snapshotCurrentRun,
  snapshotLifetimeFree,
  snapshotWorkshopLevels,
} from '../../src/save'
import { PLANNING_SNAPSHOTS } from '../helpers/planning-fixture'

describe('export snapshots', () => {
  const root = {
    exportVersion: 1, exportedAt: '2026-11-26T20:34:28.974Z', versionNumber: 1301, dataVersion: 35,
    playerID: 'secret-id', userName: 'secret-name', currentWave: 5, currentTier: 7,
    upgradeWorkshopLevel: [805], upgradeWorkshopDefenseLevel: [1300], upgradeWorkshopUtilityLevel: [149],
    starterPackUnlockedBool: true, epicPackUnlockedBool: false, disableAdsUnlockedBool: true,
  }

  it('keeps reader output and the export time, and neither the player id nor the name', () => {
    const snapshot = buildExportSnapshot(root)
    expect(snapshot?.meta).toMatchObject({ exportedAt: '2026-11-26T20:34:28.974Z', gameBuild: 1301, dataVersion: 35 })
    expect(snapshot?.readers.readPurchasesFromSaveRoot).toMatchObject({ hasStarterPack: true, hasEpicPack: false })
    expect(isExportSnapshot(snapshot)).toBe(true)
    expect(JSON.stringify(snapshot)).not.toMatch(/secret-id|secret-name/)
    expect(buildExportSnapshot(null)).toBeNull()
    expect(buildExportSnapshot([])).toBeNull()
  })

  it('orders a mixed list of saves and snapshots by export time', () => {
    const later = { ...root, exportedAt: '2026-11-27T00:00:00.000Z' }
    const ordered = orderExportSnapshots([later, PLANNING_SNAPSHOTS.at(-1), root, 7, null])
    expect(ordered.map(snapshot => snapshot.meta.exportedAt)).toEqual([
      '2026-11-26T20:34:28.974Z', '2026-11-26T20:34:28.974Z', '2026-11-27T00:00:00.000Z',
    ])
  })
})

describe('diffing two exports', () => {
  it('lists each changed value once, by reader and path', () => {
    const before = buildExportSnapshot({ exportVersion: 1, exportedAt: '2026-11-26T00:00:00Z', starterPackUnlockedBool: false, epicPackUnlockedBool: false, disableAdsUnlockedBool: true, coins: 100 })
    const after = buildExportSnapshot({ exportVersion: 1, exportedAt: '2026-11-26T01:00:00Z', starterPackUnlockedBool: true, epicPackUnlockedBool: false, disableAdsUnlockedBool: true, coins: 250 })
    const diff = diffExportSnapshots(before, after)
    const purchase = diff?.differences.filter(row => row.reader === 'readPurchasesFromSaveRoot')
    expect(purchase).toEqual([{ reader: 'readPurchasesFromSaveRoot', path: 'hasStarterPack', before: false, after: true, change: null }])
    expect(diff?.differences.find(row => row.path === 'balances.coins')).toMatchObject({ before: 100, after: 250, change: 150 })
    expect(diffExportSnapshots(before, before)?.differences).toEqual([])
    expect(diffExportSnapshots(before, 'nope')).toBeNull()
  })

  it('counts every difference even when the list is cut short', () => {
    const [a, b] = [PLANNING_SNAPSHOTS.at(-2), PLANNING_SNAPSHOTS.at(-1)]
    const full = diffExportSnapshots(a, b)
    const cut = diffExportSnapshots(a, b, { limit: 3 })
    expect(cut?.differences).toHaveLength(3)
    expect(cut?.omitted).toBe((full?.differences.length ?? 0) - 3)
    expect(cut?.countsByReader).toEqual(full?.countsByReader)
    expect(diffExportSnapshots(a, b, { readers: ['readLabsFromSaveRoot'] })?.differences.every(row => row.reader === 'readLabsFromSaveRoot')).toBe(true)
  })
})

/*
 * What the account did on Nov 25-26, from the coach's own log: Starter Pack and then Epic Pack on
 * the evening of the 25th (MST), and on the 26th Labs Coin Discount 44 stopped for Golden Tower
 * Duration 17 and Health bought from 1,142 to 1,300.
 */
describe('the event timeline', () => {
  const events = buildExportTimeline(PLANNING_SNAPSHOTS)
  const of = (kind: string) => events.filter(event => event.kind === kind)

  it('places each pack purchase between the two exports that bracket it', () => {
    expect(of('purchase').map(event => [event.detail, event.after, event.at])).toEqual([
      ['Starter Pack bought', '2026-11-26T03:40:37.111Z', '2026-11-26T03:49:20.859Z'],
      ['Epic Pack bought', '2026-11-26T03:49:20.859Z', '2026-11-26T06:32:50.148Z'],
    ])
  })

  it('tells a lab stopped from a lab finished', () => {
    const details = of('lab').map(event => event.detail)
    expect(details).toContain('Labs Coin Discount stopped in slot 5')
    expect(details).toContain('Golden Tower Duration 17 started in slot 5')
    expect(details).toContain('Spotlight Coin Bonus finished level 12')
    expect(details).not.toContain('Spotlight Coin Bonus stopped in slot 2')
  })

  it('records workshop levels bought and runs added, in time order', () => {
    expect(of('workshop').map(event => event.detail)).toEqual(['Health 1142 → 1300'])
    expect(of('run')).toHaveLength(39)
    expect(of('run').at(-2)?.data).toMatchObject({ tier: 7, wave: 2039 })
    const times = events.map(event => Date.parse(event.at))
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('filters by kind and by date', () => {
    expect(buildExportTimeline(PLANNING_SNAPSHOTS, { kinds: ['purchase'] })).toHaveLength(2)
    expect(buildExportTimeline(PLANNING_SNAPSHOTS, { kinds: ['purchase'], since: '2026-11-26T04:00:00Z' }).map(event => event.detail)).toEqual(['Epic Pack bought'])
  })
})

describe('the state at a time', () => {
  it('takes the newest export at or before the moment', () => {
    expect(exportStateAt(PLANNING_SNAPSHOTS, '2026-11-26T05:00:00Z')).toMatchObject({ takenAt: '2026-11-26T03:49:20.859Z', side: 'before', nextTakenAt: '2026-11-26T06:32:50.148Z' })
    expect(exportStateAt(PLANNING_SNAPSHOTS, '2026-11-26T03:49:20.859Z')?.takenAt).toBe('2026-11-26T03:49:20.859Z')
    expect(exportStateAt(PLANNING_SNAPSHOTS, '2020-01-01T00:00:00Z')).toMatchObject({ takenAt: '2026-11-24T21:51:44.396Z', side: 'after' })
    expect(exportStateAt(PLANNING_SNAPSHOTS, '2030-01-01T00:00:00Z')).toMatchObject({ takenAt: '2026-11-26T20:34:28.974Z', nextTakenAt: null })
    expect(exportStateAt([], '2026-11-26T05:00:00Z')).toBeNull()
    expect(exportStateAt(PLANNING_SNAPSHOTS, 'not a date')).toBeNull()
  })

  it('flags a run played while the account changed', () => {
    expect(exportChangesDuring(PLANNING_SNAPSHOTS, '2026-11-26T03:30:00Z', '2026-11-26T06:00:00Z')).toEqual(['hasStarterPack', 'hasEpicPack'])
    expect(exportChangesDuring(PLANNING_SNAPSHOTS, '2026-11-26T07:00:00Z', '2026-11-26T08:00:00Z')).toEqual([])
    expect(exportChangesDuring(PLANNING_SNAPSHOTS, '2026-11-20T00:00:00Z', '2026-11-26T08:00:00Z')).toBeNull()
  })
})

/*
 * The export at wave 532: 382 defense levels above the workshop, and the lifetime free-defense
 * counter 382 higher than at the export taken at wave 0 of the same run. No defense level bought.
 */
describe('run modes from exports taken during a run', () => {
  const ordered = orderExportSnapshots(PLANNING_SNAPSHOTS)
  const [atStart, atWave532] = [ordered.at(-2)!, ordered.at(-1)!]

  it('accounts for every defense level of the wave-532 export with free upgrades', () => {
    expect(snapshotCurrentRun(atStart)?.currentWave).toBe(0)
    expect(snapshotCurrentRun(atWave532)?.currentWave).toBe(532)
    const levels = resolveInRunLevels({
      currentRun: snapshotCurrentRun(atWave532) as never,
      workshopLevels: snapshotWorkshopLevels(atWave532),
      lifetimeFree: snapshotLifetimeFree(atWave532),
      earlier: { lifetimeFree: snapshotLifetimeFree(atStart)!, atRunStart: true },
    })
    expect(levels.categories.find(tab => tab.category === 'defense')).toEqual({ category: 'defense', gained: 382, fromFree: 382, bought: 0, freeCount: 'exact' })
    expect(levels.rows.find(row => row.stat === 'Health')).toMatchObject({ workshop: 1300, inRun: 1395, fromFree: 95, bought: 0 })
    // Attack and utility hold more levels than their free upgrades account for, so cash was spent there.
    expect(levels.mode).toBe('active')
  })

  it('calls a run active when an export during it shows levels bought, and unknown with none to go on', () => {
    const modes = new Map(resolveExportRunModes(PLANNING_SNAPSHOTS).map(mode => [mode.runDate, mode]))
    expect(modes.get('2026-11-25T22:50:06.596Z')).toMatchObject({ mode: 'active', exportsDuringRun: 1 })
    expect(modes.get('2026-11-26T13:55:15.758Z')).toMatchObject({ mode: 'unknown', exportsDuringRun: 0 })
  })
})

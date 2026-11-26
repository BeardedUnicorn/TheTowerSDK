import { describe, expect, it } from 'vitest'

import { computeCoinsPerHourFromSaveRoot } from '../../src/save/battle/history'
import {
  readBattleHistorySeriesFromSaveRoot,
  readSaveSeriesFromSaveRoot,
  readTierRecordSeriesFromSaveRoot,
  readTournamentSeriesFromSaveRoot,
} from '../../src/save/series/read'
import { readTierRecordsFromSaveRoot } from '../../src/save/tier-records/read'

/**
 * A save's history, as series.
 *
 * The mistakes available here are silent ones: a run with no date plotted at the epoch, a
 * tournament still in progress plotted as rank 0 — better than first place — and a tier the
 * player never touched plotted as a best wave of zero. Each is a believable point on a chart. So
 * each is checked as an absence, with the reason in `warnings`.
 */

const at = (iso: string) => Date.parse(iso)

/** Runs as the game writes them, in its `*ThisRound` keys. */
const SAVE = {
  battleHistory: {
    _items: [
      { tier: 5, wave: 1500, battleDate: '2026-11-03T10:00:00.000Z', coinsEarnedThisRound: 9000, realTimeThisRound: 3600, cellsEarnedThisRound: 55 },
      { tier: 5, wave: 1200, battleDate: '2026-11-01T10:00:00.000Z', coinsEarnedThisRound: 5000, realTimeThisRound: 1800, cellsEarnedThisRound: 40 },
      { tier: 6, wave: 800, battleDate: '2026-11-02T10:00:00.000Z', coinsEarnedThisRound: 3000, realTimeThisRound: 3600 },
      // No date: cannot go on a time axis.
      { tier: 5, wave: 900, coinsEarnedThisRound: 100, realTimeThisRound: 600 },
    ],
  },
  leagueID: 2,
  tournamentRecords: [
    { tournamentNumber: 317, date: '2026-11-14T00:00:00.000Z', leagueID: 2, wave: 450, rank: 7 },
    { tournamentNumber: 316, date: '2026-11-11T00:00:00.000Z', leagueID: 2, wave: 430, rank: 12 },
    // Still running: the game stores rank 0 until it ends.
    { tournamentNumber: 318, date: '2026-11-18T00:00:00.000Z', leagueID: 2, wave: 500, rank: 0 },
  ],
  // Indexed by tier number: slot 0 is empty, slot 3 is a tier never played.
  highestWaveThisTier: [0, 4500, 3200, 0, 1800],
  highestCoinsEarnedThisTier: [0, 9e9, 4e9, 0, 1e9],
}

const find = (extract: ReturnType<typeof readSaveSeriesFromSaveRoot>, id: string) =>
  extract?.series.find(series => series.id === id)

describe('battle history series', () => {
  const extract = readBattleHistorySeriesFromSaveRoot(SAVE)

  it('puts each run at its date, oldest first, whatever order the save holds them in', () => {
    expect(find(extract, 'save:battle:wave')?.data).toEqual([
      { x: at('2026-11-01T10:00:00.000Z'), y: 1200 },
      { x: at('2026-11-02T10:00:00.000Z'), y: 800 },
      { x: at('2026-11-03T10:00:00.000Z'), y: 1500 },
    ])
  })

  it('rates a run by its own coins and time', () => {
    // 5000 coins in half an hour, 3000 in an hour, 9000 in an hour.
    expect(find(extract, 'save:battle:coins-per-hour')?.data.map(point => point.y)).toEqual([10000, 3000, 9000])
    expect(find(extract, 'save:battle:coins')?.data.map(point => point.y)).toEqual([5000, 3000, 9000])
  })

  it('has the rates the account\'s coins per hour is averaged from', () => {
    // Every run here, dated or not: 10000, 9000, 3000 and 600 an hour; the stat takes the best three.
    const best = (find(extract, 'save:battle:coins-per-hour')?.data ?? [])
      .map(point => Number(point.y)).sort((a, b) => b - a).slice(0, 3)
    expect(best.reduce((sum, rate) => sum + rate, 0) / best.length).toBe(computeCoinsPerHourFromSaveRoot(SAVE))
  })

  it('leaves an undated run out of every series, and says so', () => {
    for (const series of extract?.series ?? []) expect(series.points, series.id).toBeLessThanOrEqual(3)
    expect(extract?.warnings).toContain('1 of 4 runs have no readable date and are left out.')
  })

  it('leaves a run out of only the series it has no value for', () => {
    expect(find(extract, 'save:battle:cells')?.data.map(point => point.y)).toEqual([40, 55])
    expect(find(extract, 'save:battle:wave')?.points).toBe(3)
    expect(extract?.warnings).toContain('1 dated runs have no cells earned and are left out of that series.')
  })

  it('reports each series\' own length', () => {
    for (const series of extract?.series ?? []) expect(series.data.length, series.id).toBe(series.points)
  })
})

describe('tournament series', () => {
  const extract = readTournamentSeriesFromSaveRoot(SAVE)

  it('plots the wave of every dated tournament, oldest first', () => {
    expect(find(extract, 'save:tournament:wave')?.data).toEqual([
      { x: at('2026-11-11T00:00:00.000Z'), y: 430 },
      { x: at('2026-11-14T00:00:00.000Z'), y: 450 },
      { x: at('2026-11-18T00:00:00.000Z'), y: 500 },
    ])
  })

  it('does not plot a tournament in progress as rank 0', () => {
    expect(find(extract, 'save:tournament:rank')?.data).toEqual([
      { x: at('2026-11-11T00:00:00.000Z'), y: 12 },
      { x: at('2026-11-14T00:00:00.000Z'), y: 7 },
    ])
    expect(extract?.warnings).toContain('1 tournaments have no final rank yet and are left out of the rank series.')
  })

  it('has no rank series at all when no tournament has finished', () => {
    const running = readTournamentSeriesFromSaveRoot({ leagueID: 2, tournamentRecords: [SAVE.tournamentRecords[2]] })
    expect(running?.series.map(series => series.id)).toEqual(['save:tournament:wave'])
  })
})

describe('tier record series', () => {
  const extract = readTierRecordSeriesFromSaveRoot(SAVE)

  it('plots the tiers the reader reports, by tier', () => {
    const tiers = readTierRecordsFromSaveRoot(SAVE)?.tiers ?? []
    expect(tiers.length).toBeGreaterThan(0)
    expect(find(extract, 'save:tier:highest-wave')?.data)
      .toEqual(tiers.filter(row => row.highestWave !== null).map(row => ({ x: row.tier, y: row.highestWave })))
    expect(find(extract, 'save:tier:highest-coins')?.data)
      .toEqual(tiers.filter(row => row.highestCoinsEarned !== null).map(row => ({ x: row.tier, y: row.highestCoinsEarned })))
  })

  it('reads the lists by tier number and leaves an unplayed tier out, not at zero', () => {
    expect(find(extract, 'save:tier:highest-wave')?.data).toEqual([{ x: 1, y: 4500 }, { x: 2, y: 3200 }, { x: 4, y: 1800 }])
    expect(find(extract, 'save:tier:highest-coins')?.data).toEqual([{ x: 1, y: 9e9 }, { x: 2, y: 4e9 }, { x: 4, y: 1e9 }])
  })

  it('has no series for a record the save does not carry', () => {
    // This save has no per-tier cells list.
    expect(find(extract, 'save:tier:highest-cells')).toBeUndefined()
  })
})

describe('every series a save holds', () => {
  it('gathers all three, each warning naming its part', () => {
    const extract = readSaveSeriesFromSaveRoot(SAVE)
    const ids = extract?.series.map(series => series.id) ?? []
    expect(ids).toContain('save:battle:coins-per-hour')
    expect(ids).toContain('save:tournament:rank')
    expect(ids).toContain('save:tier:highest-wave')
    expect(new Set(ids).size).toBe(ids.length)
    expect(extract?.series.every(series => series.family === 'save')).toBe(true)
    expect(extract?.warnings).toContain('battle history: 1 of 4 runs have no readable date and are left out.')
  })

  it('returns null for a save with none of it, and does not throw on a non-save', () => {
    for (const root of [{}, null, undefined, 'text', 42, []]) {
      expect(readSaveSeriesFromSaveRoot(root)).toBeNull()
      expect(readBattleHistorySeriesFromSaveRoot(root)).toBeNull()
      expect(readTournamentSeriesFromSaveRoot(root)).toBeNull()
      expect(readTierRecordSeriesFromSaveRoot(root)).toBeNull()
    }
  })

  it('reads a save that has only one of the three', () => {
    const onlyTournaments = readSaveSeriesFromSaveRoot({ leagueID: 2, tournamentRecords: SAVE.tournamentRecords })
    expect(onlyTournaments?.series.map(series => series.entity)).toEqual(['tournament', 'tournament'])
  })

  it('reports a malformed record rather than throwing on it', () => {
    const extract = readSaveSeriesFromSaveRoot({ leagueID: 2, tournamentRecords: ['not a record', SAVE.tournamentRecords[0]] })
    expect(extract?.warnings.some(warning => warning.includes('is not a record'))).toBe(true)
    expect(find(extract, 'save:tournament:wave')?.points).toBe(1)
  })

  it('leaves the save as it found it', () => {
    const before = structuredClone(SAVE)
    readSaveSeriesFromSaveRoot(SAVE)
    expect(SAVE).toEqual(before)
  })
})

/**
 * The save side of the wave survival model: reading an account out of a save or a stored
 * snapshot, measuring its rates from its own runs, and pairing each run with the state it was
 * played with.
 *
 * Pinned against `fixtures/save/survival-t7.snapshots.json`, five readings of one real tier-7
 * account cut down to the fields the model reads.
 */
import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/save/survival-t7.snapshots.json'
import {
  buildSurvivalState,
  isSurvivalSnapshot,
  listSurvivalRunFacts,
  measureSurvivalProfile,
  readSurvivalAccount,
  readSurvivalAccountFromSaveRoot,
  readSurvivalAccountFromSnapshot,
  readSurvivalRunFacts,
  survivalDefaultTier,
  survivalNearestReadingForRun,
  survivalReadingForRun,
  survivalReadingsMatch,
  survivalRunsOnTier,
} from '../../src/save/survival'
import type { SurvivalAccountReading } from '../../src/save/survival'

const snapshots = fixture.snapshots as unknown[]
const readings = snapshots.map(snapshot => readSurvivalAccountFromSnapshot(snapshot) as SurvivalAccountReading)
const latest = readings.at(-1) as SurvivalAccountReading
const AFK_LATEST = '2026-11-26T18:34:23.686Z'

describe('reading an account', () => {
  it('reads workshop levels, cards, labs and runs out of a stored snapshot', () => {
    expect(latest.takenAt).toBe('2026-11-26T20:34:28.974Z')
    expect(latest.workshopLevels['Health']).toBe(1300)
    expect(latest.workshopLevels['Recovery Amount']).toBe(35)
    expect(latest.workshopLevels['Max Recovery']).toBe(45)
    expect(latest.equippedCards).toContainEqual({ slug: 'rpc', level: 6 })
    expect(latest.labLevels).toEqual({ package_after_boss: 1, workshop_defense_discount: 30, workshop_utility_discount: 30 })
    expect(latest.unlockedGroups).toEqual({ defense: 8, utility: 6 })
    expect(latest.runs).toHaveLength(5)
  })

  it('tells a snapshot from a decoded save and reads either', () => {
    expect(isSurvivalSnapshot(snapshots[0])).toBe(true)
    expect(isSurvivalSnapshot({ upgradeWorkshopLevel: [1] })).toBe(false)
    expect(readSurvivalAccount(snapshots[0])?.workshopLevels['Health']).toBe(1142)
  })

  it('returns null rather than an empty account', () => {
    expect(readSurvivalAccountFromSnapshot({})).toBeNull()
    expect(readSurvivalAccountFromSnapshot({ readers: {} })).toBeNull()
    expect(readSurvivalAccountFromSaveRoot(null)).toBeNull()
    expect(readSurvivalAccountFromSaveRoot({})).toBeNull()
  })

  it('reads a decoded save through the save readers, runs included', () => {
    const defense = Array.from({ length: 20 }, () => 0)
    defense[0] = 1300
    const root = {
      ExportedAt: '2026-11-24T09:30:00.000Z',
      upgradeWorkshopLevel: Array.from({ length: 20 }, () => 1),
      upgradeWorkshopDefenseLevel: defense,
      upgradeWorkshopUtilityLevel: Array.from({ length: 20 }, () => 2),
      BattleHistory: [
        { tier: 7, wave: 900, battleDate: '2026-11-03T10:00:00.000Z', realTimeThisRound: 3600, damageTaken: 500, defensePercentBlocked: 1500, recoveryPackagesThisRound: 450 },
      ],
    }
    const reading = readSurvivalAccountFromSaveRoot(root)
    expect(reading?.workshopLevels['Health']).toBe(1300)
    expect(reading?.runs).toHaveLength(1)
    const facts = listSurvivalRunFacts(reading?.runs ?? [])
    expect(facts[0]).toMatchObject({ tier: 7, wave: 900, realSeconds: 3600, damageTaken: 500, packages: 450 })
    expect(facts[0].defensePercentShare).toBeCloseTo(0.75, 12)
  })
})

describe('run facts', () => {
  const run = listSurvivalRunFacts(latest.runs).find(r => r.runDate === AFK_LATEST)

  it('reads the totals the spec tabulates for the wave-2039 AFK run', () => {
    expect(run?.wave).toBe(2039)
    expect(run?.damageTaken).toBeCloseTo(0.898e12, -10)
    expect(run?.packageHeal).toBeCloseTo(0.781e12, -10)
    /* The spec's table: 78% Defense % share, 0.75B healed a package, no lifesteal. */
    expect(run?.defensePercentShare).toBeCloseTo(0.78, 2)
    expect((run?.packageHeal ?? 0) / (run?.packages ?? 1) / 1e9).toBeCloseTo(0.75, 2)
    expect(run?.lifestealHeal).toBe(0)
    expect((run?.packages ?? 0) / (run?.wave ?? 1)).toBeCloseTo(0.514, 3)
  })

  it('counts blocked damage back in as damage before mitigation', () => {
    expect(run?.damageBeforeMitigation).toBeGreaterThan((run?.damageTaken ?? 0) * 4)
    expect(run?.otherDamageTakenMultiplier).toBeGreaterThan(0.97)
    expect(run?.otherDamageTakenMultiplier).toBeLessThan(1)
  })

  it('leaves out tournaments, undated runs and runs that took no damage', () => {
    const base = { battleDate: '2026-11-03T10:00:00.000Z', tier: 7, wave: 500, damageTaken: 10 }
    expect(readSurvivalRunFacts(base)).not.toBeNull()
    expect(readSurvivalRunFacts({ ...base, isTournament: true })).toBeNull()
    expect(readSurvivalRunFacts({ ...base, battleDate: undefined })).toBeNull()
    expect(readSurvivalRunFacts({ ...base, damageTaken: 0 })).toBeNull()
  })

  it('orders runs oldest first and filters by tier and length', () => {
    const all = listSurvivalRunFacts(latest.runs)
    expect(all.map(r => r.wave)).toEqual([2697, 2193, 2230, 1826, 2039])
    expect(survivalRunsOnTier(latest, 7)).toHaveLength(5)
    expect(survivalRunsOnTier(latest, 8)).toHaveLength(0)
    expect(survivalRunsOnTier(latest, 7, 2200)).toHaveLength(2)
    expect(survivalDefaultTier(latest)).toBe(7)
  })
})

describe('measured profile', () => {
  const afk = survivalRunsOnTier(latest, 7).slice(-3)
  const profile = measureSurvivalProfile(afk, 1.9, true)

  it('is null with no runs', () => {
    expect(measureSurvivalProfile([], 1.9, true)).toBeNull()
  })

  it('measures the rates the spec reads off the same runs', () => {
    /* Free defense upgrades at 0.69 to 0.73 a wave; a fifth of waves skipped. */
    expect(profile?.freeDefenseChance).toBeGreaterThan(0.68)
    expect(profile?.freeDefenseChance).toBeLessThan(0.74)
    expect(profile?.waveSkipChance).toBeCloseTo(0.2, 1)
    expect(profile?.defensePercent).toBeCloseTo(0.75, 1)
    expect(profile?.lifestealActiveShare).toBeCloseTo(2 / 3, 12)
  })

  it('takes the after-boss packages out of the package chance only when the lab is owned', () => {
    const without = measureSurvivalProfile(afk, 1.9, false)
    expect(without?.packageChance ?? 0).toBeGreaterThan((profile?.packageChance ?? 0) + 0.05)
  })

  it('reports shares that sum to one', () => {
    const s = profile?.spawnShares
    expect((s?.basic ?? 0) + (s?.fast ?? 0) + (s?.tank ?? 0) + (s?.ranged ?? 0) + (s?.protector ?? 0)).toBeCloseTo(1, 12)
    const e = profile?.eliteShares
    expect((e?.vampire ?? 0) + (e?.ray ?? 0) + (e?.scatter ?? 0)).toBeCloseTo(1, 12)
    /* Fast, Tank and Ranged are each well above the 4% the tier-weight table gives. */
    expect(s?.fast).toBeGreaterThan(0.1)
  })
})

describe('buildSurvivalState', () => {
  const built = buildSurvivalState(latest, 7)

  it('takes levels from the workshop and the labs it can read', () => {
    expect(built.state.levels['Health']).toBe(1300)
    expect(built.state.levels['Package Chance']).toBe(60)
    expect(built.state.packageAfterBoss).toBe(true)
    expect(built.state.bonuses.healthMultiplier).toBe(4)
    expect(built.discountPercent).toEqual({ defense: 15, utility: 15 })
  })

  it('takes the rates from what the runs measured', () => {
    expect(built.measured?.runs).toBe(5)
    expect(built.state.waveSkipChance).toBeCloseTo(built.measured?.waveSkipChance ?? 0, 12)
    expect(0.495 + built.state.bonuses.defensePercentAdd).toBeCloseTo(built.measured?.defensePercent ?? 0, 12)
  })

  it('counts the uncapped upgrades outside the model that share free upgrades', () => {
    /* Defense: Land Mine Damage and Orbs are unlocked and not maxed; the Wall is still locked. */
    expect(built.state.freeUpgrades.otherDefenseTargets).toBe(2)
    expect(built.state.freeUpgrades.otherUtilityTargets).toBe(0)
  })

  it('says what it left to the calibration', () => {
    expect(built.warnings.join(' ')).toMatch(/max health/)
    expect(built.warnings.join(' ')).toMatch(/Death Wave/)
    expect(built.warnings.join(' ')).toMatch(/kill speed/)
  })

  it('falls back to the cards and says so when a tier has no runs', () => {
    const bare = buildSurvivalState(latest, 9)
    expect(bare.measured).toBeNull()
    expect(bare.warnings.join(' ')).toMatch(/no finished farming runs on tier 9/)
    /* Extra Defense level 7 is 11%, Recovery Package Chance level 6 is 30%. */
    expect(bare.state.bonuses.defensePercentAdd).toBeCloseTo(0.11, 12)
    expect(bare.state.bonuses.packageChanceAdd).toBeCloseTo(0.3, 12)
    expect(bare.assumptions).toEqual({})
  })
})

describe('pairing a run with the state it was played with', () => {
  const runs = survivalRunsOnTier(latest, 7)
  const byDate = (date: string) => runs.find(r => r.runDate === date) as (typeof runs)[number]

  it('uses the reading before a run when the one after agrees', () => {
    const paired = survivalReadingForRun(byDate('2026-11-26T13:55:15.758Z'), readings)
    expect(paired.reason).toBeNull()
    expect(paired.reading?.takenAt).toBe('2026-11-26T08:18:51.227Z')
    expect(paired.reading?.workshopLevels['Health']).toBe(1142)
  })

  it('refuses a run the readings changed around', () => {
    const paired = survivalReadingForRun(byDate('2026-11-26T02:29:00.649Z'), readings)
    expect(paired.reading).toBeNull()
    expect(paired.reason).toMatch(/changed/)
  })

  it('refuses a run with no reading before it, and names why', () => {
    const paired = survivalReadingForRun(byDate('2026-11-25T22:50:06.596Z'), readings)
    expect(paired.reading).toBeNull()
    expect(paired.reason).toBe('no reading before this run started')
  })

  it('can fall back to the reading taken during the run', () => {
    const nearest = survivalNearestReadingForRun(byDate('2026-11-25T22:50:06.596Z'), readings)
    expect(nearest?.takenAt).toBe('2026-11-25T22:07:43.342Z')
  })

  it('sees a Health purchase as a changed state', () => {
    expect(survivalReadingsMatch(readings[2], readings[3])).toBe(true)
    expect(survivalReadingsMatch(readings[3], readings[4])).toBe(false)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { findLabResearchRecord } from '../../src/data/labs/research'
import { parseDuration } from '../../src/formatting/numbers/compute'

/*
 * Every LAB_CATALOG ladder against game data v29.2.1 (facts/v29.2.1/lab-ladders.json), with no
 * cost or time modifier.
 *
 * A level may differ from the game only by how it is written. A cost is the game's value rounded
 * or truncated to the catalog's own significant figures, never fewer than three (2.3e21 for
 * 2.25e21 is an error, not rounding), or within 1e-5 of it: the game raises its ladders to a power
 * in single precision. A duration is the game's time floored, rounded or ceiled to the unit it is
 * written in, "1144:12:17" to the second, "16d 4h 46m" and "05:37:00" to the minute, "248:00:00"
 * to the hour, or floored from a second below ("99:59:59" for 100 h).
 *
 * Levels that differed by more were wrong, and now carry the game's value:
 *  - Protector Health and Radius L2-L30 were 10B a level too cheap from L2 (80.01B for 90.005B).
 *  - Super Tower Bonus L7-L9 and L24-L26 held the next level's cost, so L7 fell below L6.
 *  - Labs Speed's times and Labs Coin Discount's costs had their own bonus already taken off, which
 *    the SDK's modifiers then took off again.
 *  - Damage / Meter and the four cash and coin labs copied Damage's first levels; the game asks
 *    40 coins and 20 s for L1, not 30 coins and 14 s.
 *  - Death Wave Armor Stripping L1-L7 had lost their days (08:00:00 for 200 h); Death Wave Cells
 *    Bonus was off by up to 8% at every level.
 *  - Typos: Double Death Ray L2-L10, Reroll Shards L6 (115.26M for 155.26M), Recovery Package Max
 *    L4 (L3's cost), Module Coin Cost and Module Shard Cost L16 (10 h too long), Defense L40 and
 *    L46, Waves Required L86-L88, among others.
 *  - Ladders written to the minute that drifted a minute every few levels: the assist-module,
 *    enemy-type, resistance and enhancement-discount labs (75d 14h 19m for 75d 14h 17m).
 * Wall Health L2 (1.2B for 1.2001B) was only rounding.
 */
interface FactLevel { level: number, cost: number, seconds: number, benefit: number }
interface FactLab { index: number, slug: string, name: string, levelMax: number, levels: FactLevel[] }
const facts: { gameVersion: string, labs: FactLab[] }
  = JSON.parse(readFileSync(new URL('../../facts/v29.2.1/lab-ladders.json', import.meta.url), 'utf8'))

const factByIndex = new Map(facts.labs.map(lab => [lab.index, lab]))
const indexOf = (slug: string) => findLabResearchRecord(slug)?.index

/** Catalog labs the facts do not hold, and why. */
const EFFECT_BANS = ['cannon_effect_bans', 'armor_effect_bans', 'generator_effect_bans', 'core_effect_bans']
const BATTLE_CONDITION_LABS = [
  'ultimate_weapon_durations', 'death_defy_down', 'energy_shields_down', 'enemy_level_skip_reduction',
  'fasts_ultimate', 'ranged_ultimate', 'bosss_ultimate', 'basics_ultimate', 'tanks_ultimate',
  'protectors_ultimate', 'armored_enemies', 'enemy_speed', 'more_enemies', 'enemy_attack_speed',
]
const isMastery = (slug: string) => slug.endsWith('_mastery')

const significantFigures = (x: number) =>
  x === 0 ? 1 : x.toExponential().split('e')[0].replace('.', '').replace(/0+$/, '').length

function toFigures(x: number, figures: number, mode: 'round' | 'truncate'): number {
  const exponent = Math.floor(Math.log10(Math.abs(x))) - figures + 1
  const scaled = x / 10 ** exponent
  const kept = mode === 'round' ? Math.round(scaled) : Math.floor(scaled + 1e-9)
  return Number((kept * 10 ** exponent).toPrecision(figures + 1))
}

function costIsWrittenFrom(ours: number, game: number): boolean {
  if (ours === game || Math.abs(ours - game) <= 1e-5 * game) return true
  const figures = Math.max(3, significantFigures(ours))
  // Single precision puts 310465 at 310464.996, which must still round to 310470.
  return [game, game * (1 + 1e-6), game * (1 - 1e-6)].some(value =>
    (['round', 'truncate'] as const).some(mode => Math.abs(toFigures(value, figures, mode) - ours) <= 1e-12 * game))
}

/** The unit a duration is written to, in seconds. */
function unitOf(duration: string): number {
  const clock = duration.match(/^(\d+):(\d+):(\d+)(?:\.\d+)?$/)
  if (clock) return Number(clock[3]) !== 0 ? 1 : Number(clock[2]) !== 0 ? 60 : 3600
  return /\d\s*s\b/.test(duration) ? 1 : 60
}

function timeIsWrittenFrom(duration: string, game: number): boolean {
  const ours = parseDuration(duration)
  const unit = unitOf(duration)
  // The facts hold whole seconds, so the game's time is within half a second of them.
  return [game - 0.5, game, game + 0.5].some(time =>
    [Math.floor(time / unit), Math.ceil(time / unit), Math.floor((time - 1) / unit)]
      .some(units => Math.abs(units * unit - ours) < 0.5))
}

describe('lab ladders, as game data v29.2.1 has them', () => {
  it('reads facts for the right build', () => {
    expect(facts.gameVersion).toBe('v29.2.1')
    expect(facts.labs.length).toBe(180)
  })

  it('holds every catalog lab, or says why not', () => {
    // A row with no research index is not a lab in the game. Ray, Scatter and Vampire Enemy
    // Defense were three such rows, copies of the Health labs, and were removed.
    const missing = LAB_CATALOG
      .map(row => row.slug)
      .filter(slug => !factByIndex.has(indexOf(slug) ?? -1))
      .filter(slug => !isMastery(slug))
    expect(missing.sort()).toEqual([...EFFECT_BANS, ...BATTLE_CONDITION_LABS].sort())
    for (const slug of missing) expect(indexOf(slug), slug).toBeDefined()
  })

  it.each(facts.labs.map(lab => [lab.slug, lab] as const))('%s costs and takes what the game asks at every level', (slug, lab) => {
    const row = LAB_CATALOG.find(entry => indexOf(entry.slug) === lab.index)
    expect(row, `${slug} is in LAB_CATALOG`).toBeDefined()
    const levels = (row?.levels ?? []).filter(level => level.level > 0)
    expect(levels.map(level => level.level)).toEqual(lab.levels.map(level => level.level))
    const wrong: string[] = []
    for (const [i, level] of levels.entries()) {
      const game = lab.levels[i]
      if (!costIsWrittenFrom(level.cost, game.cost)) wrong.push(`L${level.level} cost ${level.cost}, game ${game.cost}`)
      if (!timeIsWrittenFrom(level.duration, game.seconds)) wrong.push(`L${level.level} time ${level.duration}, game ${game.seconds} s`)
    }
    expect(wrong).toEqual([])
  })

  it('has the battle-condition labs at the game cost', () => {
    // The game's lab table has their costs but not their times.
    const research = LAB_CATALOG.filter(row => BATTLE_CONDITION_LABS.includes(row.slug))
    expect(research.length).toBe(BATTLE_CONDITION_LABS.length)
    expect(research.find(row => row.slug === 'armored_enemies')?.levels.find(level => level.level === 2)?.cost).toBe(1e18)
  })

  it.each([
    // [slug, level, coins, seconds]: what the catalog had wrong, now the game's value.
    ['protector_health', 2, 90_005_000_000, null],
    ['protector_radius', 3, 140_069_640_000, null],
    ['super_tower_bonus', 7, 12_528_399_000, null],
    ['double_death_ray', 2, 2_910_000, null],
    ['reroll_shards', 6, 155_258_480, null],
    ['recovery_package_max', 4, 35_325_110_000, null],
    ['module_coin_cost', 16, 585_535_600_000, 812_453],
    ['module_shards_cost', 16, null, 812_453],
    ['labs_speed', 36, null, 623_523],
    ['labs_coin_discount', 99, 19_355_790, null],
    ['cash_bonus', 1, 40, 20],
    ['death_wave_armor_stripping', 1, null, 720_000],
    ['defense', 40, null, 12_583_272],
  ] as const)('%s L%d is the game value', (slug, level, cost, seconds) => {
    const row = LAB_CATALOG.find(entry => entry.slug === slug)?.levels.find(entry => entry.level === level)
    expect(row, `${slug} L${level}`).toBeDefined()
    if (cost !== null) expect(Math.abs(row!.cost - cost) / cost).toBeLessThan(1e-7)
    if (seconds !== null) expect(Math.abs(parseDuration(row!.duration) - seconds)).toBeLessThanOrEqual(1)
  })
})

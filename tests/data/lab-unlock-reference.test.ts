import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MILESTONE_KEY_UNLOCK_ROWS } from '../../src/data/milestones/tracks'

/**
 * Checks which tier and wave unlocks each lab against the Effective Paths
 * reference.
 *
 * Our equivalent is MILESTONE_KEY_UNLOCK_ROWS, NOT labs-research's
 * `tierUnlock` / `milestoneUnlock`. Those two fields are table indices,
 * not a tier and a wave: Workshop Attack
 * Discount carries milestoneUnlock 3 where the wave is 40, because 3 indexes a
 * milestone row. Comparing them against the sheet produced 192 "mismatches"
 * that were nothing of the kind.
 */

interface UnlockReference {
  unlocks: Array<{ name: string; tier: number; wave: number }>
}

const reference = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'data', 'effective-paths-lab-unlocks.json'), 'utf8'),
) as UnlockReference

/**
 * Our milestone rewards use the game's own lab names (the research table's display names), and
 * the sheet mostly does too, with small spellings of its own -- "Super Crit Multi" for "Super
 * Crit Mult", "Missile Despawn Time" for "Missiles Despawn Time". Fold case, punctuation, the
 * plural s ending any word and Mult / Multi / Multiplier so the comparison is about tiers and
 * waves rather than spelling.
 */
/** The sheet still uses names the game has since changed. */
const SHEET_NAME_RENAMES: Record<string, string> = { 'Card Presets': 'Presets' }

const matchKey = (value: string): string => String(SHEET_NAME_RENAMES[value] ?? value)
  .toLowerCase()
  .replace(/\bmult(?:iplier|i)?\b/g, 'multi')
  .replace(/s\b/g, '')
  .replace(/[^a-z0-9]+/g, '')

/** A reward can appear on both tracks and at more than one tier, so keep them all. */
const oursByReward = new Map<string, Array<{ tier: number; wave: number; track: string }>>()
for (const row of MILESTONE_KEY_UNLOCK_ROWS) {
  if (row.kind !== 'unlock') continue
  const key = matchKey(row.reward)
  if (!oursByReward.has(key)) oursByReward.set(key, [])
  oursByReward.get(key)!.push({ tier: row.tier, wave: row.wave, track: row.track })
}

/**
 * Six labs used to sit at the wrong tier or wave and now match the reference.
 *
 * Each was checked against the rest of its tier before being moved, and in
 * every case the surrounding rows already agreed, which is what made the
 * placement rather than the sheet the thing at fault:
 *
 * - Max Interest was tier 1 wave 80; it belongs at tier 2 wave 80 next to
 *   Interest %, which we already had there.
 * - Land Mine Decay was tier 4 premium; tier 6 wave 30 already held Land Mine
 *   Damage, and the reference lists both together.
 * - Wall Rebuild was tier 7 wave 10; tier 8 wave 10 already held Wall Health.
 *
 * The tier 10 bot labs and the tier 16 Swamp Rend labs were later moved to wave 60 to match the
 * sheet, and that was wrong: the game's own milestone table puts them at wave 50. See
 * `GAME_OVERRULES_SHEET` below.
 */

/**
 * Where the game's own milestone table (facts/v29.2.0/milestone-rewards.json) contradicts the
 * sheet. The game wins; the wiki ("Milestones/10 11 12", "16 17 18", "4 5 6") agrees with it.
 * Each entry must keep disagreeing: one that starts agreeing means the sheet was fixed and the
 * exception should go.
 */
const GAME_OVERRULES_SHEET: Record<string, string> = {
  'Bot Bot - Cooldown': 'T6 W60 (game: tier 6 slot 5, Research 228)',
  'Bot Bot - Duration': 'T10 W50 (game: tier 10 slot 4, ResearchGroup 24)',
  'Flame Bot - Burn Stack': 'T10 W50 (game: tier 10 slot 4, ResearchGroup 24)',
  'Thunder Bot - Linger Time': 'T10 W50 (game: tier 10 slot 4, ResearchGroup 24)',
  'Swamp Rend - Additional Enemies': 'T16 W50 (game: tier 16 slot 4, ResearchGroup 25)',
  // The sheet opens the effect bans with the buy multiplier; the game's research table gates all
  // four with the module labs, and the wiki's "Substat Effect Bans" row agrees.
  'Cannon Effect Bans': 'T10 W40 (game: tier 10 slot 3, ResearchGroup 21)',
  'Armor Effect Bans': 'T10 W40 (game: tier 10 slot 3, ResearchGroup 21)',
  'Generator Effect Bans': 'T10 W40 (game: tier 10 slot 3, ResearchGroup 21)',
  'Core Effect Bans': 'T10 W40 (game: tier 10 slot 3, ResearchGroup 21)',
}

describe('lab unlocks against the Effective Paths reference', () => {
  it('agrees on tier and wave for every lab it shares', () => {
    const disagreements: string[] = []
    let matched = 0

    for (const entry of reference.unlocks) {
      const ours = oursByReward.get(matchKey(entry.name))
      if (!ours) continue
      const agrees = ours.some(row => row.tier === entry.tier && row.wave === entry.wave)
      if (entry.name in GAME_OVERRULES_SHEET) {
        expect(agrees, `${entry.name} now matches the sheet: drop it from GAME_OVERRULES_SHEET`).toBe(false)
        const [tier, wave] = GAME_OVERRULES_SHEET[entry.name].match(/T(\d+) W(\d+)/)!.slice(1).map(Number)
        expect(ours.some(row => row.tier === tier && row.wave === wave), `${entry.name} moved off the game's placement`).toBe(true)
        continue
      }
      if (agrees) {
        matched += 1
        continue
      }
      const describe = ours.map(row => `T${row.tier} W${row.wave} [${row.track}]`).join(' / ')
      disagreements.push(`${entry.name}: reference=T${entry.tier} W${entry.wave}, ours=${describe}`)
    }

    expect(disagreements.sort()).toEqual([])
    // 149 since the lab groups were read from the game's research table and names folded by word.
    expect(matched).toBeGreaterThanOrEqual(149)
  })

  it('records how much of the reference our milestone rows cover', () => {
    // 158 of the 203 labs in the reference since every lab group was read from the game's research
    // table (2026-11-24). Most of the rest are labs no milestone gates, which is right; a drop
    // means rows were lost.
    const covered = reference.unlocks.filter(entry => oursByReward.has(matchKey(entry.name))).length
    expect(covered).toBeGreaterThanOrEqual(158)
    expect(reference.unlocks.length).toBeGreaterThanOrEqual(203)
  })
})

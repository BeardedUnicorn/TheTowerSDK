import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeWorkshopEnhancementMaxLevel } from '../../src/data/workshop/compute'
import { enhancementMaxLevel } from '../../src/mechanics/effective-paths/enhancement-costs'

/*
 * Every Workshop Enhancement's cap as game data v29.2.0 has it. The cost tables used to stop at the
 * pre-v28.3 caps (Damage 400, Cash 300, Attack Speed 75, Orb Size, Coin and Cells 200, Free
 * Upgrades 100); v28.3 raised most of them (patch note 1521195372519751772).
 */
const facts = JSON.parse(readFileSync(new URL('../../facts/v29.2.0/workshop-enhancement-caps.json', import.meta.url), 'utf8'))
const CAPS: Record<string, number> = { ...facts.attack, ...facts.defense, ...facts.utility }

const WSP_KEY_BY_NAME: Record<string, string> = {
  'Damage': 'WSP_DAMAGE',
  'Rend Armor': 'WSP_REND_ARMOR',
  'Critical Factor': 'WSP_CRITICAL_FACTOR',
  'Damage/Meter': 'WSP_DAMAGE_PER_METER',
  'Super Crit Mult': 'WSP_SUPER_CRIT_MULTI',
  'Attack Speed': 'WSP_ATTACK_SPEED',
  'Health': 'WSP_HEALTH',
  'Health Regen': 'WSP_HEALTH_REGEN',
  'Defense Absolute': 'WSP_DEFENSE_ABSOLUTE',
  'Land Mine Damage': 'WSP_LAND_MINE_DAMAGE',
  'Wall Health': 'WSP_WALL_HEALTH',
  'Orb Size': 'WSP_ORB_SIZE',
  'Cash Bonus': 'WSP_CASH_BONUS',
  'Coin Bonus': 'WSP_COIN_BONUS',
  'Cells / Kill Bonus': 'WSP_CELLS_PER_KILL_BONUS',
  'Free Upgrades': 'WSP_FREE_UPGRADES',
  'Recovery Package': 'WSP_RECOVERY_PACKAGE',
  'Enemy Level Skips': 'WSP_ENEMY_LEVEL_SKIP',
}

describe('workshop enhancement caps, as v29.2.0 has them', () => {
  it('covers all eighteen enhancements', () => {
    expect(Object.keys(CAPS).sort()).toEqual(Object.keys(WSP_KEY_BY_NAME).sort())
  })

  it.each(Object.entries(CAPS))('%s caps at %i in both cost tables', (name, cap) => {
    expect(computeWorkshopEnhancementMaxLevel(WSP_KEY_BY_NAME[name])).toBe(cap)
    expect(enhancementMaxLevel(name)).toBe(cap)
  })
})

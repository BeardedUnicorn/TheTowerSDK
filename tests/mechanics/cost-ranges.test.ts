import { describe, expect, it } from 'vitest'

import {
  HARMONY_VAULT_TREE,
  LAB_CATALOG,
  POWER_VAULT_TREE,
  ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED,
  botStatCostBetween,
  buildLabProgressRows,
  findGuardianDefinition,
  guardianStatCost,
  guardianUpgrades,
  sumGuardianAllStatCosts,
  sumGuardianStatCostsBetween,
  sumUltimateWeaponPlusUnlockStones,
  sumUltimateWeaponUnlockStones,
  WORKSHOP_DATA,
  workshopCashCostBetween,
  workshopCoinCostBetween,
} from '../../src/data'
import { uwPlusUnlockTotal } from '../../src/charts'
import { GUARDIAN_CHIP_TOTAL_COST } from '../../src/knowledge'
import {
  enhancementCoinCost,
  enhancementCoinCostBetween,
  enhancementMaxLevel,
  labCoinCostBetween,
  labCoinCostToReachLevel,
  labDurationDaysBetween,
  labMaxCatalogLevel,
  ultimateWeaponMaxLevel,
  ultimateWeaponStoneCostBetween,
  vaultNodeKeysBetween,
  vaultTreeKeysRemaining,
} from '../../src/mechanics'

/**
 * "What does it cost to get from here to there?" for every ladder that only priced one step.
 *
 * Each helper is held to three things: the numbers printed in its own table, the rule that two
 * adjoining ranges add up to the range that spans them, and a refusal — `null`, not a smaller
 * total — for a name it does not know or a level its table does not have. The last matters most:
 * a sum that quietly stops at the cap is a real-looking number for a purchase that cannot be made.
 */

/** A range splits anywhere without changing its total. */
const splits = (between: (from: number, to: number) => number | null, from: number, mid: number, to: number) => {
  const whole = between(from, to)
  expect(whole).not.toBeNull()
  const parts = (between(from, mid) ?? NaN) + (between(mid, to) ?? NaN)
  // Relative, because the long ladders total past what a double holds to the coin.
  expect(Math.abs(parts - (whole as number))).toBeLessThanOrEqual(Math.abs(whole as number) * 1e-12)
}

describe('guardian chip stat costs', () => {
  it('reads the costs printed in the upgrade table', () => {
    // attack: level 2 costs 25, level 3 costs 50; cooldown levels 2-4 cost 1, 2, 3.
    expect(guardianUpgrades.attack[1]?.attackCost).toBe(25)
    expect(guardianUpgrades.attack[2]?.attackCost).toBe(50)
    expect(sumGuardianStatCostsBetween('attack', 'Percentage', 0, 2)).toBe(75)
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', 0, 3)).toBe(6)
    expect(sumGuardianStatCostsBetween('attack', 'Targets', 0, 9)).toBe(4500)
  })

  it('counts levels from 0, where the table counts from 1', () => {
    // The table's first row is level 1 and free; here that is level 0.
    expect(guardianUpgrades.attack[0]?.level).toBe(1)
    expect(guardianStatCost('attack', 'Percentage', 0)).toBe(0)
    expect(guardianStatCost('attack', 'Percentage', 1)).toBe(25)
  })

  it('takes a chip or stat by key, label or spacing', () => {
    expect(findGuardianDefinition('Attack')?.key).toBe('attack')
    expect(sumGuardianStatCostsBetween('Ally', 'max recovery', 0, 3))
      .toBe(sumGuardianStatCostsBetween('ally', 'Max Recovery', 0, 3))
    expect(sumGuardianStatCostsBetween('ally', 'maxRecovery', 0, 3)).toBeGreaterThan(0)
  })

  it('adds up across a split', () => {
    splits((from, to) => sumGuardianStatCostsBetween('attack', 'Cooldown', from, to), 0, 17, 40)
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', 5, 5)).toBe(0)
  })

  it('refuses a level past a stat\'s own last, which is shorter than the chip\'s longest', () => {
    // Targets stops at 10 in the table (level 9 here) while Cooldown runs to 90.
    expect(sumGuardianStatCostsBetween('attack', 'Targets', 0, 10)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'Targets', 10, 10)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', 0, 89)).toBeGreaterThan(0)
  })

  it('refuses what it does not know', () => {
    expect(sumGuardianStatCostsBetween('nope', 'Cooldown', 0, 1)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'nope', 0, 1)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', 3, 2)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', 0.5, 2)).toBeNull()
    expect(sumGuardianStatCostsBetween('attack', 'Cooldown', -1, 2)).toBeNull()
    expect(findGuardianDefinition('constructor')).toBeNull()
  })

  it('totals a whole chip to the figure the guardian compartment states', () => {
    for (const [chip, total] of Object.entries(GUARDIAN_CHIP_TOTAL_COST)) {
      expect(sumGuardianAllStatCosts(chip), chip).toBe(total)
    }
    expect(Object.keys(GUARDIAN_CHIP_TOTAL_COST)).toHaveLength(6)
  })

  it('charges less for a chip already part-way up', () => {
    const fresh = sumGuardianAllStatCosts('attack') as number
    expect(sumGuardianAllStatCosts('attack', [2, 0, 0])).toBe(fresh - 75)
    expect(sumGuardianAllStatCosts('attack', [0, 0, 99])).toBeNull()
  })
})

describe('ultimate weapon unlock ladders', () => {
  it('sums the published ladder', () => {
    expect([...ULTIMATE_WEAPON_UNLOCK_STONE_COSTS_BY_OWNED]).toEqual([5, 50, 150, 300, 800, 1250, 1750, 2400, 3000])
    expect(sumUltimateWeaponUnlockStones(0, 9)).toBe(9705)
    expect(sumUltimateWeaponUnlockStones(0, 1)).toBe(5)
    // With six owned the workshop showed "New Ultimate Weapon 1750".
    expect(sumUltimateWeaponUnlockStones(6, 7)).toBe(1750)
    expect(sumUltimateWeaponUnlockStones(6, 9)).toBe(1750 + 2400 + 3000)
  })

  it('sums the plus ladder to the total the chart prints', () => {
    expect(sumUltimateWeaponPlusUnlockStones(0, 9)).toBe(14650)
    expect(uwPlusUnlockTotal).toBe('14650')
    expect(sumUltimateWeaponPlusUnlockStones(0, 1)).toBe(500)
    expect(sumUltimateWeaponPlusUnlockStones(8, 9)).toBe(3800)
  })

  it('adds up across a split, and is nothing for no purchase', () => {
    splits(sumUltimateWeaponUnlockStones, 0, 4, 9)
    splits(sumUltimateWeaponPlusUnlockStones, 2, 5, 9)
    expect(sumUltimateWeaponUnlockStones(3, 3)).toBe(0)
  })

  it('refuses a count the game cannot have', () => {
    expect(sumUltimateWeaponUnlockStones(0, 10)).toBeNull()
    expect(sumUltimateWeaponUnlockStones(-1, 2)).toBeNull()
    expect(sumUltimateWeaponUnlockStones(4, 2)).toBeNull()
    expect(sumUltimateWeaponPlusUnlockStones(0, 9.5)).toBeNull()
  })
})

describe('ultimate weapon stat stone costs', () => {
  it('sums the stone chart, starting after the unlock', () => {
    // Death Wave Damage levels 1-3 cost 5, 11 and 17 on the chart.
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Damage', 0, 3)).toBe(33)
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Damage', 1, 3)).toBe(28)
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Damage', 2, 2)).toBe(0)
  })

  it('adds up across a split, to the chart\'s last level', () => {
    const max = ultimateWeaponMaxLevel('Death Wave', 'Damage') as number
    splits((from, to) => ultimateWeaponStoneCostBetween('Death Wave', 'Damage', from, to), 0, 12, max)
  })

  it('refuses a level past the chart rather than totalling up to it', () => {
    const max = ultimateWeaponMaxLevel('Death Wave', 'Damage') as number
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Damage', 0, max + 1)).toBeNull()
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Nope', 0, 1)).toBeNull()
    expect(ultimateWeaponStoneCostBetween('Nope', 'Damage', 0, 1)).toBeNull()
    expect(ultimateWeaponStoneCostBetween('Death Wave', 'Damage', 3, 1)).toBeNull()
  })
})

describe('vault node key costs', () => {
  it('reads a three-level node and a one-level node', () => {
    // `defabs` is priced 5, 10, 20; `discount1` is a single level at 5.
    expect(vaultNodeKeysBetween('defabs', 0, 3)).toBe(35)
    expect(vaultNodeKeysBetween('defabs', 1, 3)).toBe(30)
    expect(vaultNodeKeysBetween('defabs', 2, 2)).toBe(0)
    expect(vaultNodeKeysBetween('discount1', 0, 1)).toBe(5)
  })

  it('refuses a level a node does not have', () => {
    expect(vaultNodeKeysBetween('discount1', 0, 2)).toBeNull()
    expect(vaultNodeKeysBetween('defabs', 0, 4)).toBeNull()
    expect(vaultNodeKeysBetween('nope', 0, 1)).toBeNull()
    expect(vaultNodeKeysBetween('defabs', 2, 1)).toBeNull()
  })

  it('prices a whole tree at the tree\'s own stated total', () => {
    expect(vaultTreeKeysRemaining('power')).toBe(POWER_VAULT_TREE.totalKeyCost)
    expect(vaultTreeKeysRemaining('harmony')).toBe(HARMONY_VAULT_TREE.totalKeyCost)
  })

  it('takes off what is already bought', () => {
    const whole = vaultTreeKeysRemaining('harmony') as number
    expect(vaultTreeKeysRemaining('harmony', { discount1: 1 })).toBe(whole - 5)
    const power = vaultTreeKeysRemaining('power') as number
    expect(vaultTreeKeysRemaining('power', { defabs: 2 })).toBe(power - 15)
    expect(vaultTreeKeysRemaining('power', { defabs: 3 })).toBe(power - 35)
  })

  it('refuses a misspelt node rather than counting it as unbought', () => {
    expect(vaultTreeKeysRemaining('harmony', { discount: 1 })).toBeNull()
    expect(vaultTreeKeysRemaining('harmony', { defabs: 1 })).toBeNull()
    expect(vaultTreeKeysRemaining('enemy')).toBeNull()
    expect(vaultTreeKeysRemaining('power', { defabs: 4 })).toBeNull()
  })
})

describe('workshop enhancement coin costs', () => {
  it('sums the single-level price over the levels bought', () => {
    // Health's first three levels are 5.00B, 5.04B and 5.11B.
    expect(enhancementCoinCostBetween('Health', 0, 3)).toBe(15_150_000_000)
    expect(enhancementCoinCostBetween('Health', 1, 2)).toBe(5_040_000_000)
    expect(enhancementCoinCostBetween('Health', 7, 7)).toBe(0)
  })

  it('applies both discounts, as a purchase does', () => {
    const discounts = { globalDiscountPct: 0.1, defenseDiscountLabLevel: 10 }
    // 10% vault discount and 10 levels of the 0.3% defense lab: x0.9 x0.97.
    expect(enhancementCoinCostBetween('Health', 0, 3, discounts)).toBeCloseTo(15_150_000_000 * 0.9 * 0.97, 0)
    expect(enhancementCoinCostBetween('Health', 0, 1, discounts)).toBe(enhancementCoinCost('Health', 1, discounts))
  })

  it('adds up across a split, to the last level', () => {
    const max = enhancementMaxLevel('Health') as number
    splits((from, to) => enhancementCoinCostBetween('Health', from, to), 0, 250, max)
  })

  it('refuses a level past the table', () => {
    const max = enhancementMaxLevel('Health') as number
    expect(enhancementCoinCostBetween('Health', 0, max + 1)).toBeNull()
    expect(enhancementCoinCostBetween('Nope', 0, 1)).toBeNull()
    expect(enhancementCoinCostBetween('constructor', 0, 1)).toBeNull()
    expect(enhancementCoinCostBetween('Health', 4, 3)).toBeNull()
  })
})

describe('lab coin cost and research time', () => {
  it('sums the catalog\'s coin costs', () => {
    // Damage levels 1-3 cost 30, 71 and 178 coins.
    expect(labCoinCostBetween('damage', 0, 3)).toBe(279)
    expect(labCoinCostBetween('Damage', 1, 3)).toBe(249)
    expect(labCoinCostBetween('damage', 4, 4)).toBe(0)
  })

  it('applies the coin discount lab to every level', () => {
    // Level 50 of the discount lab takes 15% off.
    expect(labCoinCostBetween('damage', 0, 3, { coinDiscountLabLevel: 50 })).toBeCloseTo(279 * 0.85, 6)
    expect(labCoinCostBetween('damage', 2, 3, { coinDiscountLabLevel: 50 }))
      .toBe(labCoinCostToReachLevel('damage', 3, { coinDiscountLabLevel: 50 }))
  })

  it('adds up across a split, to the catalog\'s last level', () => {
    const max = labMaxCatalogLevel('damage')
    splits((from, to) => labCoinCostBetween('damage', from, to), 0, 40, max)
    splits((from, to) => labDurationDaysBetween('damage', from, to, { labSpeedLabLevel: 30 }), 0, 40, max)
  })

  it('agrees with the lab screen\'s own cumulative time', () => {
    const lab = LAB_CATALOG.find(entry => entry.slug === 'damage')
    const rows = buildLabProgressRows(lab as never, 10, 20, { labRelic: 0, labSpeed: 30, labDiscount: 0, speedUp: 1 } as never)
    const hours = (labDurationDaysBetween('damage', 10, 20, { labSpeedLabLevel: 30 }) as number) * 24
    expect(hours).toBeCloseTo(rows.at(-1)?.cumulativeTimeHours as number, 6)
  })

  it('runs Labs Speed at its own level, whatever speed level is passed', () => {
    const lab = LAB_CATALOG.find(entry => entry.slug === 'labs_speed')
    const rows = buildLabProgressRows(lab as never, 50, 55, { labRelic: 0, labSpeed: 0, labDiscount: 0, speedUp: 1 } as never)
    const expected = rows.at(-1)?.cumulativeTimeHours as number

    const atZero = (labDurationDaysBetween('labs_speed', 50, 55) as number) * 24
    const atNinety = (labDurationDaysBetween('Labs Speed', 50, 55, { labSpeedLabLevel: 90 }) as number) * 24
    expect(atZero).toBeCloseTo(expected, 6)
    expect(atNinety).toBeCloseTo(expected, 6)
    // And a flat sum would have been about twice as long: level 51 runs at x2.0, not x1.0.
    expect(atZero).toBeLessThan(expected * 1.01)
  })

  it('still honours the speed level for every other lab', () => {
    const slow = labDurationDaysBetween('damage', 10, 20) as number
    const fast = labDurationDaysBetween('damage', 10, 20, { labSpeedLabLevel: 50 }) as number
    expect(fast).toBeCloseTo(slow / 2, 9)
  })

  it('refuses a level past the catalog', () => {
    const max = labMaxCatalogLevel('damage')
    expect(labCoinCostBetween('damage', 0, max + 1)).toBeNull()
    expect(labDurationDaysBetween('damage', 0, max + 1)).toBeNull()
    expect(labCoinCostBetween('no such lab', 0, 1)).toBeNull()
    expect(labCoinCostBetween('damage', 5, 4)).toBeNull()
    expect(labDurationDaysBetween('damage', 1.5, 4)).toBeNull()
  })
})

describe('bot stat medal costs', () => {
  it('sums the upgrade table by name', () => {
    // Golden Bot Cooldown levels 1-3 cost 100, 140 and 180.
    expect(botStatCostBetween('Golden Bot', 'Cooldown', 0, 3)).toBe(420)
    expect(botStatCostBetween('golden bot', 'cooldown', 1, 3)).toBe(320)
    expect(botStatCostBetween('Golden Bot', 'Cooldown', 2, 2)).toBe(0)
  })

  it('adds up across a split', () => {
    splits((from, to) => botStatCostBetween('Golden Bot', 'Cooldown', from, to), 0, 7, 15)
  })

  it('refuses a level past the stat, which the underlying sum would clamp', () => {
    // Cooldown stops at 15 while Duration runs to 30.
    expect(botStatCostBetween('Golden Bot', 'Cooldown', 0, 16)).toBeNull()
    expect(botStatCostBetween('Golden Bot', 'Duration', 0, 16)).toBeGreaterThan(0)
    expect(botStatCostBetween('No Bot', 'Cooldown', 0, 1)).toBeNull()
    expect(botStatCostBetween('Golden Bot', 'Nope', 0, 1)).toBeNull()
    expect(botStatCostBetween('Golden Bot', 'Cooldown', 3, 1)).toBeNull()
  })
})

describe('workshop coin costs', () => {
  it('reads each row as the price of the level after it', () => {
    // Damage rows 0-2 carry 30, 55 and 88 coins.
    expect(workshopCoinCostBetween('Damage', 0, 1)).toBe(30)
    expect(workshopCoinCostBetween('Damage', 0, 2)).toBe(85)
    expect(workshopCoinCostBetween('Damage', 0, 3)).toBe(173)
    expect(workshopCoinCostBetween('Damage', 1, 3)).toBe(143)
    expect(workshopCoinCostBetween('Damage', 9, 9)).toBe(0)
  })

  it('adds up across a split, to the last row', () => {
    splits((from, to) => workshopCoinCostBetween('Damage', from, to), 0, 300, 6000)
  })

  it('refuses a level past the table, and a name that is not a stat', () => {
    expect(workshopCoinCostBetween('Damage', 0, 6001)).toBeNull()
    expect(workshopCoinCostBetween('Nope', 0, 1)).toBeNull()
    expect(workshopCoinCostBetween('constructor', 0, 1)).toBeNull()
    expect(workshopCoinCostBetween('Damage', 4, 3)).toBeNull()
    expect(workshopCoinCostBetween('Damage', 0.5, 3)).toBeNull()
  })
})

describe('workshop cash costs inside a run', () => {
  it('reads each row as the cash price of the level after it', () => {
    // Health rows 0-4 carry 10, 12, 15, 19 and 23 cash.
    expect(workshopCashCostBetween('Health', 0, 1)).toBe(10)
    expect(workshopCashCostBetween('Health', 0, 5)).toBe(79)
    expect(workshopCashCostBetween('Health', 1, 3)).toBe(27)
    expect(workshopCashCostBetween('Health', 9, 9)).toBe(0)
    // Wall Health rows 0 and 1 are checked against the native ladder in workshop-reference.
    expect(workshopCashCostBetween('Wall Health', 0, 2)).toBe(175 + 276)
  })

  it('totals the rows it spans and nothing else', () => {
    const rows = WORKSHOP_DATA['Wall Health']
    let byHand = 0
    for (let level = 300; level < 320; level += 1) byHand += rows[String(level)].cash
    expect(workshopCashCostBetween('Wall Health', 300, 320)).toBe(byHand)
  })

  it('adds up across a split, to the last row', () => {
    splits((from, to) => workshopCashCostBetween('Damage', from, to), 0, 300, 6000)
  })

  it('leaves out the last row, whose cash is above zero with no level after it', () => {
    expect(WORKSHOP_DATA['Wall Health']['1800'].cash).toBeGreaterThan(0)
    expect(workshopCashCostBetween('Wall Health', 1799, 1800)).toBe(WORKSHOP_DATA['Wall Health']['1799'].cash)
    expect(workshopCashCostBetween('Wall Health', 1800, 1800)).toBe(0)
    expect(workshopCashCostBetween('Wall Health', 1800, 1801)).toBeNull()
  })

  it('refuses a level past the table, and a name that is not a stat', () => {
    expect(workshopCashCostBetween('Damage', 0, 6001)).toBeNull()
    expect(workshopCashCostBetween('Nope', 0, 1)).toBeNull()
    expect(workshopCashCostBetween('constructor', 0, 1)).toBeNull()
    expect(workshopCashCostBetween('Damage', 4, 3)).toBeNull()
    expect(workshopCashCostBetween('Damage', 0.5, 3)).toBeNull()
  })
})

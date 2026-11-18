import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARD_TEMPLATES } from '../../src/data'
import { MILESTONE_TIER_DATA } from '../../src/data/milestones/tracks'
import { parseNumberInput } from '../../src/formatting'
import { RELIC_IMPORT_CATALOG, THEME_CATALOG } from '../../src/save/catalogs/indexes.data'

/**
 * Catalog values must match the versioned reference fixtures under explicit unit conversions.
 *
 * The catalogs here were assembled from the wiki, from community sheets and from earlier
 * reference tables, and a wrong value in one of them does not fail — it renders, and it feeds a
 * planner. Two were wrong before this file existed:
 *
 *   - Wave Accelerator level 5 said 48% where the game shows 46%, breaking the card's own
 *     +4 progression (30 / 34 / 38 / 42 / 46 / 50 / 54)
 *   - Milestone tier 1 wave 10 said 10 Coins where the game shows 25 (40 since v29.2)
 *
 * WHAT THE STORED TABLE IS NOT. `cardBenefit` is the value the game keeps, and for most
 * cards it is also the value the game SHOWS. For some it is not, and the card screen is the
 * authority on what a player sees. Two are known and listed in `STORED_DIFFERS_FROM_SHOWN`
 * below; both were "corrected" here against the stored table before screenshots settled it,
 * which is the mistake this comment exists to stop repeating. A difference between the two
 * is a fact about the game worth recording, not a defect in this package to be patched away.
 *
 * The comparison is against committed `facts/v29.0.0/*.json` fixtures containing
 * identifiers, values and units. Stored values and display values remain distinct.
 *
 * UNITS are the one subtlety, and they are handled explicitly rather than by loosening the
 * comparison. The game stores a fraction where this package stores a percent, a multiplier
 * where it stores a percent increase, and seconds where it stores minutes. Each card is
 * checked under the conventions its own `levelType` allows, so a real difference cannot hide
 * behind a unit and a unit is never reported as a difference.
 */

const FACTS = path.resolve(__dirname, '../../facts/v29.0.0')
/** Milestones are checked against the newest build: v29.1 and v29.2 changed two cells. */
const FACTS_V29_2 = path.resolve(__dirname, '../../facts/v29.2.0')

function readFact<T>(name: string, dir = FACTS): T {
  return JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as T
}

interface CardBenefitFact {
  gameVersion: string
  cards: { cardId: string; levelValues: number[] }[]
}

interface MilestoneFactRow { slot: number; type: string | null; value: number | null }

interface MilestoneFact {
  gameVersion: string
  tiers: {
    tier: number
    free: MilestoneFactRow[]
    premium: MilestoneFactRow[]
  }[]
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Readings of a stored value that this package legitimately uses. */
function readings(stored: number): number[] {
  return [
    stored, //               same unit
    stored * 100, //         fraction -> percent
    (stored - 1) * 100, //   multiplier -> percent increase
    (1 - stored) * 100, //   multiplier -> percent reduction
    stored / 60, //          seconds -> minutes
  ]
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(5e-3, Math.abs(b) * 2e-3)

/**
 * Cards whose STORED benefit is not the number the card screen shows.
 *
 * The card screen is what a player reads, so this package follows it. The stored value is
 * retained in the versioned fixture; it just is not the
 * same quantity, and asserting they are equal makes this suite demand a wrong answer.
 *
 * Confirmed from in-game screenshots on 2026-09-03, after both were briefly "fixed" the
 * wrong way against the stored table.
 */
const STORED_DIFFERS_FROM_SHOWN: Record<string, string> = {
  'Death Ray':
    'shows 2.3 / 2.7 / 3.1 / 3.5 / 3.9 / 4.4 / 4.9 sec; stored table runs 2.3 / 2.66 / 3.05 '
    + '/ 3.44 / 3.83 / 4.3 / 4.6. Level 1 agrees and the rest drift, so the shown duration is '
    + 'not the stored one.',
  'Energy Shield':
    'shows 8 min at level 7; the stored table has 485 seconds, which is 8.08. Levels 1-6 '
    + 'agree exactly at 60 s per minute, so only the last entry differs.',
}

describe('card level values match the reference fixture', () => {
  const fact = readFact<CardBenefitFact>('card-benefits.json')
  const byCard = new Map(fact.cards.map(c => [normalise(c.cardId), c.levelValues]))

  const checked = CARD_TEMPLATES.filter(
    card => byCard.has(normalise(card.name)) && !(card.name in STORED_DIFFERS_FROM_SHOWN),
  )

  it('covers the cards the game has a benefit table for', () => {
    // Not every card is in both: `Super Tower` is special-cased in game code and has no row
    // in the benefit table, so it is legitimately absent rather than missing.
    expect(checked.length).toBeGreaterThanOrEqual(26)
  })

  it('every documented exception still disagrees, and is still in the table', () => {
    // If one of these ever starts matching, the game changed or the reason recorded above was
    // wrong. Either way it should stop being an exception rather than sit here unexamined.
    for (const [name, reason] of Object.entries(STORED_DIFFERS_FROM_SHOWN)) {
      const card = CARD_TEMPLATES.find(c => c.name === name)
      expect(card, `${name} is no longer a card`).toBeTruthy()
      const game = byCard.get(normalise(name))
      expect(game, `${name} has no stored benefit row`).toBeTruthy()
      const agrees = [0, 1, 2, 3, 4].some(which =>
        game!.every((stored, i) => close(card!.levelValues[i], readings(stored)[which])),
      )
      expect(agrees, `${name} now AGREES with the stored table — drop the exception. ${reason}`).toBe(false)
    }
  })

  it.each(checked.map(card => [card.name, card] as const))(
    '%s',
    (_name, card) => {
      const game = byCard.get(normalise(card.name))!
      expect(card.levelValues).toHaveLength(game.length)
      // One consistent reading has to explain EVERY level. Allowing a different convention
      // per level would let a single wrong number slip through as a unit change.
      const consistent = [0, 1, 2, 3, 4].some(which =>
        game.every((stored, i) => close(card.levelValues[i], readings(stored)[which])),
      )
      expect(consistent, `no single unit convention maps ${card.name} to ${JSON.stringify(game)}`).toBe(true)
    },
  )
})

/** The wave each milestone slot pays at, as the game indexes slots within a tier. */
const MILESTONE_SLOT_WAVES = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 4500,
]
const CURRENCIES = new Set(['Coins', 'Gems', 'Stones'])

/** `10T Coins` as `{ unit: 'Coins', amount: 1e13 }`; null for anything that is not a currency. */
function readCurrencyLabel(label: string): { unit: string; amount: number } | null {
  const match = label.match(/^([\d.,]+[a-zA-Z]{0,2})\s+(Coins|Gems|Stones)$/)
  return match ? { unit: match[2], amount: parseNumberInput(match[1]) } : null
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9)

describe('milestone rewards match the game', () => {
  const fact = readFact<MilestoneFact>('milestone-rewards.json', FACTS_V29_2)
  const towerSkins = new Map((THEME_CATALOG as readonly { category: string; catalogIndex: number; label: string }[])
    .filter(row => row.category === 'tower')
    .map(row => [row.catalogIndex, row.label]))
  const relics = new Map((RELIC_IMPORT_CATALOG as readonly { index: number; benefit: number }[])
    .map(row => [row.index, row.benefit]))

  it('has the same number of tiers as the game', () => {
    expect(MILESTONE_TIER_DATA.length).toBe(fact.tiers.length)
  })

  /*
   * Every cell of every tier, both tracks. Only tier 1 used to be checked, and tiers 22-24 were
   * wrong in almost every cell (T22 W10 said 2T Coins where the game pays 10T) without failing.
   */
  for (const tier of fact.tiers) {
    for (const [factTrack, track] of [['free', 'standard'], ['premium', 'premium']] as const) {
      it(`tier ${tier.tier} ${track} pays what the game pays, wave by wave`, () => {
        const data = MILESTONE_TIER_DATA.find(entry => entry.tier === tier.tier)![track]
        expect(data.waveRewards.map(w => w.wave)).toEqual(MILESTONE_SLOT_WAVES)
        for (const reward of tier[factTrack]) {
          const wave = MILESTONE_SLOT_WAVES[reward.slot]
          const labels = data.waveRewards.find(w => w.wave === wave)!.rewards
          const where = `tier ${tier.tier} ${track} wave ${wave}: ${JSON.stringify(labels)}`
          const currency = labels.map(readCurrencyLabel)
          if (reward.type && CURRENCIES.has(reward.type)) {
            expect(labels, where).toHaveLength(1)
            expect(currency[0]?.unit, where).toBe(reward.type)
            expect(sameAmount(currency[0]!.amount, reward.value!), `${where} — the game pays ${reward.value}`).toBe(true)
            continue
          }
          // Everything else is an unlock, a skin or a relic, never a currency amount.
          expect(currency.every(entry => entry === null), `${where} — the game gives ${reward.type}`).toBe(true)
          if (reward.type === 'Tier') expect(labels, where).toContain(`Tier ${reward.value}`)
          if (reward.type === 'TowerSkin') expect(labels, where).toEqual([`${towerSkins.get(reward.value!)} Skin`])
          if (reward.type === 'Relic') {
            const percent = Math.round(relics.get(reward.value!)! * 1000) / 10
            expect(labels[0], where).toMatch(new RegExp(`^Relic: .+ \\+${String(percent).replace('.', '\\.')}%$`))
          }
        }
      })

      it(`tier ${tier.tier} ${track} totals add up from its own rewards`, () => {
        const data = MILESTONE_TIER_DATA.find(entry => entry.tier === tier.tier)![track]
        const sums: Record<string, number> = { Coins: 0, Gems: 0, Stones: 0 }
        for (const label of data.waveRewards.flatMap(w => w.rewards)) {
          const currency = readCurrencyLabel(label)
          if (currency) sums[currency.unit] += currency.amount
        }
        expect(sameAmount(data.totals.coinsValue, sums.Coins), `coins ${data.totals.coinsText}`).toBe(true)
        expect(data.totals.gemsValue).toBe(sums.Gems)
        expect(data.totals.stonesValue).toBe(sums.Stones)
      })
    }
  }
})

describe('the shipped fixtures contain catalog data', () => {
  // Keep test-harness state out of the catalog fixtures consumed by the SDK.
  it.each([
    path.join(FACTS, 'card-benefits.json'),
    path.join(FACTS, 'milestone-rewards.json'),
    path.join(FACTS, 'daily-mission-goals.json'),
    path.join(FACTS_V29_2, 'milestone-rewards.json'),
  ])(
    '%s contains no test-harness state',
    file => {
      const name = path.basename(file)
      const text = readFileSync(file, 'utf8')
      for (const word of ['seededGrid', 'sentinel', 'resumes', 'emulated', 'seed_length', 'faked']) {
        expect(text, `${name} mentions ${word}`).not.toContain(word)
      }
    },
  )
})

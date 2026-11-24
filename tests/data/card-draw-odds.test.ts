import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  CARD_IMPORT_CATALOG,
  CARD_MILESTONE_UNLOCK_REWARDS,
  CARD_TEMPLATES,
  MILESTONE_TIER_DATA,
} from '../../src/data'
import { computeCardDrawOdds } from '../../src/mechanics'
import type { CardDrawCandidate } from '../../src/mechanics'
import { readCardDrawOddsFromSaveRoot } from '../../src/save'

/*
 * What a card pull can land on: the rarity odds, the share of each card, and which cards are in
 * the pool at all. Pinned to the game twice — the milestone rewards in game data v29.2.0 for
 * which cards are gated, and the Card Chances panel of a v29.2.2 account on 2026-11-24 for the
 * odds (facts/v29.2.2/live-ui-check.json, `cardChances`).
 */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('milestone-gated cards', () => {
  const milestones = json('../../facts/v29.2.0/milestone-rewards.json') as {
    tiers: { tier: number, free: { slot: number, type: string, value: number | null }[] }[]
  }
  const fromGame = milestones.tiers.flatMap(tier => tier.free
    .filter(reward => reward.type === 'CardUnlock')
    .map(reward => ({
      card: CARD_IMPORT_CATALOG.find(row => row.index === reward.value)?.slug,
      tier: tier.tier,
      slot: reward.slot,
    })))

  it('are the six card unlocks in the game\'s milestone table, at the same tier and slot', () => {
    expect(fromGame).toHaveLength(6)
    expect(CARD_MILESTONE_UNLOCK_REWARDS.map(({ card, tier, slot }) => ({ card, tier, slot }))).toEqual(fromGame)
  })

  it('name real cards and the wave the milestone track shows', () => {
    for (const unlock of CARD_MILESTONE_UNLOCK_REWARDS) {
      const template = CARD_TEMPLATES.find(card => card.id === unlock.card)
      expect(template?.name, unlock.card).toBe(unlock.name)
      const track = MILESTONE_TIER_DATA.find(row => row.tier === unlock.tier)!.standard.waveRewards
      const reward = track.find(row => row.wave === unlock.wave)?.rewards.join(' ') ?? ''
      // The track spells Ultimate Crit as "UW Crit".
      expect(reward, `${unlock.name} at tier ${unlock.tier}`).toMatch(new RegExp(unlock.name === 'Ultimate Crit' ? 'UW Crit' : unlock.name))
    }
  })
})

describe('computeCardDrawOdds', () => {
  const pool = (drawable: (card: (typeof CARD_TEMPLATES)[number]) => boolean): CardDrawCandidate[] =>
    CARD_TEMPLATES.map(card => ({ card: card.id, rarity: card.rarity, drawable: drawable(card) }))

  it('splits 80 / 17 / 3 evenly across the cards of each rarity', () => {
    const odds = computeCardDrawOdds(pool(() => true))
    expect(odds.rarities).toEqual({ common: 0.8, rare: 0.17, epic: 0.03 })
    expect(odds.cards.find(card => card.card === 'dmg')?.chance).toBeCloseTo(0.8 / 12, 12)
    expect(odds.cards.find(card => card.card === 'ws')?.chance).toBeCloseTo(0.17 / 9, 12)
    expect(odds.cards.find(card => card.card === 'dr')?.chance).toBeCloseTo(0.03 / 11, 12)
    expect(odds.unverified).toEqual([])
  })

  it('gives nothing to a card that cannot be drawn and shares its rarity among the rest', () => {
    const odds = computeCardDrawOdds(pool(card => card.id !== 'aoe'))
    expect(odds.cards.find(card => card.card === 'aoe')?.chance).toBe(0)
    expect(odds.cards.find(card => card.card === 'dr')?.chance).toBeCloseTo(0.03 / 10, 12)
  })

  it('moves Common\'s whole share to Rare once every Common is maxed, as the game does', () => {
    const odds = computeCardDrawOdds(pool(card => card.rarity !== 'common'))
    expect(odds.rarities.common).toBe(0)
    expect(odds.rarities.rare).toBeCloseTo(0.97, 12)
    expect(odds.rarities.epic).toBeCloseTo(0.03, 12)
    expect(odds.unverified).toEqual([])
  })

  it('names every move the game has not been seen to make', () => {
    const odds = computeCardDrawOdds(pool(card => card.rarity === 'common'))
    expect(odds.rarities.common).toBeCloseTo(1, 12)
    expect(odds.unverified).toHaveLength(2)
    expect(odds.unverified.join(' ')).toMatch(/Rare/)
    expect(odds.unverified.join(' ')).toMatch(/Epic/)
  })

  it('is all zero once nothing can be drawn', () => {
    const odds = computeCardDrawOdds(pool(() => false))
    expect(odds.rarities).toEqual({ common: 0, rare: 0, epic: 0 })
    expect(odds.cards.every(card => card.chance === 0)).toBe(true)
  })
})

describe('the Card Chances panel on 2026-11-24', () => {
  const facts = json('../../facts/v29.2.2/live-ui-check.json').cardChances as {
    levels: Record<string, number>
    claimedCardMilestones: string[]
    shownRarities: Record<'common' | 'rare' | 'epic', string>
    shownCards: Record<string, string>
  }

  const percent = (chance: number) => `${(chance * 100).toFixed(2)}%`
  const rarityPercent = (share: number) => `${Math.round(share * 100)}%`

  it('comes out of the pure function', () => {
    const candidates = CARD_TEMPLATES.map(card => {
      const gate = CARD_MILESTONE_UNLOCK_REWARDS.find(unlock => unlock.card === card.id)
      const inPool = !gate || facts.claimedCardMilestones.includes(card.id)
      return { card: card.id, rarity: card.rarity, drawable: inPool && facts.levels[card.id] < 7 }
    })
    const odds = computeCardDrawOdds(candidates)
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      expect(rarityPercent(odds.rarities[rarity]), rarity).toBe(facts.shownRarities[rarity])
    }
    for (const card of odds.cards) expect(percent(card.chance), card.card).toBe(facts.shownCards[card.card])
  })

  it('comes out of a save holding the same cards and milestone claims', () => {
    const indexOf = (id: string) => CARD_IMPORT_CATALOG.find(row => row.slug === id)!.index
    const cardLevel = Array.from({ length: 40 }, () => 1)
    const cardUnlocked = Array.from({ length: 40 }, () => false)
    for (const [id, level] of Object.entries(facts.levels)) {
      cardLevel[indexOf(id)] = level
      // Owned once drawn; the two unclaimed milestone cards have never been drawn.
      cardUnlocked[indexOf(id)] = !CARD_MILESTONE_UNLOCK_REWARDS.some(unlock => unlock.card === id)
        || facts.claimedCardMilestones.includes(id)
    }
    const slotsPerTier = 23
    const milestonesRewardClaimed = Array.from({ length: 25 * slotsPerTier }, () => false)
    for (const unlock of CARD_MILESTONE_UNLOCK_REWARDS) {
      if (facts.claimedCardMilestones.includes(unlock.card)) milestonesRewardClaimed[unlock.tier * slotsPerTier + unlock.slot] = true
    }

    const read = readCardDrawOddsFromSaveRoot({ cardLevel, cardUnlocked, cardCount: cardLevel.map(() => 0), milestonesRewardClaimed })!
    expect(read.warnings).toEqual([])
    for (const card of read.odds.cards) expect(percent(card.chance), card.card).toBe(facts.shownCards[card.card])
    expect(read.pool.find(row => row.card === 'uwc')).toMatchObject({ inPool: false, drawable: false, gatedBy: { tier: 14, wave: 50 } })
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { LAB_RESEARCH_BY_INDEX, MILESTONE_TIER_DATA, RELIC_TEMPLATES } from '../../src/data'
import { parseNumberInput } from '../../src/formatting'

/*
 * The milestone tracks against the game twice over: the Milestones screen of a v29.2.2 account for
 * tiers 1-15 (facts/v29.2.2/milestone-screen.json, read 2026-11-24), and the game's research table
 * for which labs each lab reward opens, on all 24 tiers.
 */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

interface ScreenTier { tier: number, free: string[], premium: string[] }
const screen = json('../../facts/v29.2.2/milestone-screen.json') as { waves: number[], tiers: ScreenTier[] }

const CURRENCY = /^([\d.,]+\s*[A-Za-z]?)\s+(coins|gems|stones)$/i
const amount = (text: string) => {
  const match = CURRENCY.exec(text.trim())
  return match ? { unit: match[2].toLowerCase(), value: parseNumberInput(match[1].replace(/\s/g, '')) } : null
}
const track = (tier: number, key: 'free' | 'premium') =>
  MILESTONE_TIER_DATA.find(row => row.tier === tier)![key === 'free' ? 'standard' : 'premium']

describe('the Milestones screen, tiers 1-15', () => {
  it('lists the same 23 waves', () => {
    expect(screen.waves).toEqual(track(1, 'free').waveRewards.map(row => row.wave))
    expect(screen.tiers.map(row => row.tier)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
  })

  for (const tier of screen.tiers) {
    for (const key of ['free', 'premium'] as const) {
      it(`tier ${tier.tier} ${key} shows what the SDK says`, () => {
        tier[key].forEach((shown, slot) => {
          const wave = screen.waves[slot]
          const labels = track(tier.tier, key).waveRewards.find(row => row.wave === wave)!.rewards
          const where = `tier ${tier.tier} ${key} wave ${wave}: screen "${shown}", SDK ${JSON.stringify(labels)}`
          const shownAmount = amount(shown)
          if (shownAmount) {
            expect(labels.map(amount), where).toEqual([shownAmount])
            return
          }
          expect(labels.map(amount).every(entry => entry === null), where).toBe(true)

          const tierUnlock = /^Unlock Tier (\d+)$/.exec(shown)
          const skin = /^(.+) skin$/.exec(shown)
          if (tierUnlock) expect(labels, where).toEqual([`Tier ${tierUnlock[1]}`])
          else if (skin) expect(labels, where).toEqual([`${skin[1]} Skin`])
          else if (shown.startsWith('T:')) {
            // The screen names the relic; the SDK writes its effect.
            const relic = RELIC_TEMPLATES.find(row => row.name === shown)
            expect(relic?.event, where).toBe(`T${tier.tier} W4500`)
            expect(labels[0], where).toMatch(new RegExp(`^Relic: .+ \\+${relic!.value.replace('.', '\\.')}$`))
          } else if (/ researches$/.test(shown)) expect(labels.length, where).toBeGreaterThan(1)
          // From tier 13 the screen says only this, for one lab or a group (T14 W60 is four labs).
          else if (shown === 'Unlock research') expect(labels.some(label => label.startsWith('Card: ')), where).toBe(false)
          else if (shown === 'Unlock new card') expect(labels[0], where).toMatch(/^Card: /)
          else if (shown.startsWith('Unlock ') && labels[0] !== shown) {
            // A card or a system: "Unlock Nuke" is "Card: Nuke", "Unlock Lab" is "Labs".
            const name = shown.slice('Unlock '.length)
            expect([`Card: ${name}`, `${name}s`, name], where).toContain(labels[0])
          } else expect(labels, where).toEqual([shown])
        })
      })
    }
  }
})

describe('lab unlocks', () => {
  const facts = json('../../facts/v29.2.0/milestone-rewards.json') as {
    tiers: { tier: number, free: { slot: number, type: string | null, value: number | null }[] }[]
  }
  /** The screen calls lab 40 "Presets"; the research table still says "Card Presets". */
  const SCREEN_NAMES: Record<number, string> = { 40: 'Presets' }
  const gatedAt = (tier: number, slot: number) => LAB_RESEARCH_BY_INDEX
    .filter(lab => lab.displayName && lab.tierUnlock === tier && lab.milestoneUnlock === slot)
    .sort((a, b) => a.index - b.index)
  const labRewards = facts.tiers.flatMap(tier => tier.free
    .filter(reward => reward.type === 'Research' || reward.type === 'ResearchGroup')
    .map(reward => ({ tier: tier.tier, ...reward })))

  it('name exactly the labs the game\'s research table opens at that tier and slot', () => {
    expect(labRewards.length).toBeGreaterThan(80)
    for (const reward of labRewards) {
      const labs = gatedAt(reward.tier, reward.slot)
      const wave = screen.waves[reward.slot]
      const labels = track(reward.tier, 'free').waveRewards.find(row => row.wave === wave)!.rewards
      const where = `tier ${reward.tier} wave ${wave} (${reward.type} ${reward.value})`
      expect(labels, where).toEqual(labs.map(lab => SCREEN_NAMES[lab.index] ?? lab.displayName))
      if (reward.type === 'Research') expect(labs.map(lab => lab.index), where).toEqual([reward.value])
    }
  })

  it('leave two labs that open with a wave rather than a reward', () => {
    // Both slots pay gems on the milestone track; the lab opens on reaching the wave.
    const rewardSlots = new Set(labRewards.map(reward => `${reward.tier}:${reward.slot}`))
    const elsewhere = LAB_RESEARCH_BY_INDEX
      .filter(lab => lab.displayName && lab.tierUnlock > 0 && !rewardSlots.has(`${lab.tierUnlock}:${lab.milestoneUnlock}`))
      .map(lab => `${lab.displayName} T${lab.tierUnlock} W${screen.waves[lab.milestoneUnlock]}`)
    expect(elsewhere).toEqual(['First Trade-off Choice T2 W300', 'Black Hole ignore Protector T5 W300'])
  })
})

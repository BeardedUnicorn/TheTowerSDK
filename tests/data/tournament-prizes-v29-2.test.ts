import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHAMPION_TOURNAMENT_PRIZES_V29,
  COPPER_TOURNAMENT_PRIZES_V29,
  GOLD_TOURNAMENT_PRIZES_V29,
  GRAND_CHAMPION_TOURNAMENT_PRIZES_V29,
  MYTHIC_TOURNAMENT_PRIZES_V29,
  PLATINUM_TOURNAMENT_PRIZES_V29,
  SILVER_TOURNAMENT_PRIZES_V29,
} from '../../src/data/generated/tournament-prizes-v29.generated'
import { getTournamentRewardsForLeague } from '../../src/data/tournaments/data'

/*
 * Every league's prizes against the game's own v29.2.0 tables. Platinum and Champion stones were
 * the pre-correction v29.0.0 values (patch note 1542638399708594186, v29.0.1, fixed them in game).
 */
const facts = JSON.parse(readFileSync(new URL('../../facts/v29.2.0/tournament-prizes.json', import.meta.url), 'utf8'))
const TABLES = {
  Copper: COPPER_TOURNAMENT_PRIZES_V29,
  Silver: SILVER_TOURNAMENT_PRIZES_V29,
  Gold: GOLD_TOURNAMENT_PRIZES_V29,
  Platinum: PLATINUM_TOURNAMENT_PRIZES_V29,
  Champion: CHAMPION_TOURNAMENT_PRIZES_V29,
  Legend: GRAND_CHAMPION_TOURNAMENT_PRIZES_V29,
  Mythic: MYTHIC_TOURNAMENT_PRIZES_V29,
} as const

describe('tournament prizes, as v29.2.0 has them', () => {
  it.each(Object.keys(TABLES))('%s matches the game', (league) => {
    expect(TABLES[league as keyof typeof TABLES]).toEqual(facts.leagues[league])
  })

  it('the reward rows agree with the prize tables', () => {
    for (const league of ['Platinum', 'Champion'] as const) {
      const stones = getTournamentRewardsForLeague(league).map(row => row.stones)
      expect(stones).toEqual(facts.leagues[league].map((row: { stones: number }) => row.stones))
    }
  })
})

/**
 * `next_unlocks` and `coin_bonus` answer two questions that took several calls and a function no
 * tool could run: what the next purchase on each screen costs, and what the Battle tab's coin
 * bonus is at another tier or after a change.
 *
 * Both are joins over the save readers, so they are checked against those readers rather than
 * against numbers of their own.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeLabRushGems } from '@beardedunicorn/thetowersdk/data'
import { decodePlayerInfoSaveBytesAsync } from '@beardedunicorn/thetowersdk/node'
import { readTotalCoinBonusFromSaveRoot } from '@beardedunicorn/thetowersdk/save'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS } from '../../mcp/server.mjs'

type Answer = Record<string, any>
const run = (tool: string, args: Record<string, unknown> = {}): Promise<Answer> =>
  Promise.resolve((TOOLS as Record<string, { run: (a: unknown) => unknown }>)[tool]!.run(args)) as Promise<Answer>

const flags = (length: number, setBelow: number): boolean[] => Array.from({ length }, (_, index) => index < setBelow)
const EXPORTED_AT = '2026-11-24T09:30:00.000Z'
const COINS_WAVE = 23

/** An export holding what the two tools read: unlock flags, balances, one running lab, a tier. */
const EXPORT = {
  ExportVersion: 1,
  ExportedAt: EXPORTED_AT,
  VersionNumber: 1296,
  DataVersion: 35,
  CurrentTier: 7,
  Coins: 600_000_000,
  Stones: 1800,
  Gems: 500,
  UpgradeTierUnlocked: flags(12, 5),
  UpgradeDefenseTierUnlocked: flags(12, 8),
  UpgradeUtilityTierUnlocked: flags(12, 6),
  UltimateWeaponUnlocked: flags(9, 6),
  UltimateWeaponPlusUnlocked: flags(9, 0),
  ResearchLevel: Array.from({ length: 260 }, (_, index) => (index === COINS_WAVE ? 57 : 0)),
  ResearchPercentComplete: Array.from({ length: 260 }, () => 0),
  ResearchCompleteDate: Array.from({ length: 260 }, (_, index) =>
    index === COINS_WAVE ? new Date(Date.parse(EXPORTED_AT) + 25_394_000).toISOString() : '0001-01-01T00:00:00.000Z'),
  LabsUnlocked: 0,
  LabLevel: [0],
  LabResearchInt: [COINS_WAVE],
  LabActiveBool: [true],
  LabSpeedUpSpeed: [2],
  LabSpeedUpRemainingSeconds: [0],
}

let directory: string
let savePath: string

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'next-unlocks-'))
  savePath = path.join(directory, 'tool_export.json')
  fs.writeFileSync(savePath, JSON.stringify(EXPORT))
})

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('next_unlocks', () => {
  it('prices the next workshop unlock on each tab, and says which the coins cover', async () => {
    const answer = await run('next_unlocks', { path: savePath })
    expect(answer.path).toBe(savePath)
    expect(answer.balances).toEqual({ coins: 600_000_000, stones: 1800, gems: 500 })
    expect(answer.workshop.attack).toEqual({
      unlocked: 5,
      next: { opens: ['Rend Armor Chance', 'Rend Armor Mult'], coins: 500_000_000_000 },
      affordable: false,
    })
    expect(answer.workshop.defense).toMatchObject({ next: { coins: 500_000_000 }, affordable: true })
  })

  it('prices the next ultimate weapon and plus, and says why a plus is not yet for sale', async () => {
    const answer = await run('next_unlocks', { path: savePath })
    expect(answer.ultimateWeapon).toEqual({ owned: 6, stones: 1750, affordable: true })
    expect(answer.ultimateWeaponPlus).toMatchObject({ owned: 0, stones: 500, allWeaponsOwned: false })
    expect(answer.ultimateWeaponPlus.note).toMatch(/all nine/)
  })

  it('prices the Rush button on the running lab from its time left', async () => {
    const answer = await run('next_unlocks', { path: savePath })
    expect(answer.labs.running).toEqual([{
      slot: 0,
      lab: 'Coins / Wave',
      completedLevel: 57,
      remainingSeconds: 25_394,
      rushGems: computeLabRushGems(25_394 / 3600, answer.labs.maxedLabs),
      affordable: true,
    }])
  })

  it('refuses an argument it does not read', async () => {
    const answer = await run('next_unlocks', { path: savePath, tab: 'attack' })
    expect(answer.error).toMatch(/does not read "tab"/)
  })

  it('explains a path with no export rather than throwing', async () => {
    const answer = await run('next_unlocks', { path: path.join(directory, 'missing.json') })
    expect(answer.error).toMatch(/no file at/)
  })
})

describe('coin_bonus', () => {
  it('answers with what the save reader gives at the save\'s own tier', async () => {
    const answer = await run('coin_bonus', { path: savePath })
    const { parsedRoot } = await decodePlayerInfoSaveBytesAsync(fs.readFileSync(savePath))
    const direct = readTotalCoinBonusFromSaveRoot(parsedRoot)!
    expect(answer.tier).toBe(7)
    expect(answer.bonus).toEqual(direct.bonus)
    expect(answer.input).toEqual(direct.input)
  })

  it('prices another tier, with the Difficulty Tier row moving', async () => {
    const own = await run('coin_bonus', { path: savePath })
    const other = await run('coin_bonus', { path: savePath, tier: 12 })
    expect(other.tier).toBe(12)
    expect(other.bonus.difficultyTier).not.toBe(own.bonus.difficultyTier)
    expect(other.bonus.themes).toBe(own.bonus.themes)
  })

  it('runs a what-if over one field and returns the new rows beside the old', async () => {
    const answer = await run('coin_bonus', { path: savePath, overrides: { purchases: { hasStarterPack: true } } })
    expect(answer.bonus.starterPack).toBe(1)
    expect(answer.whatIf.bonus.starterPack).toBeGreaterThan(1)
    expect(answer.whatIf.input.purchases).toEqual({ ...answer.input.purchases, hasStarterPack: true })
    expect(answer.whatIf.totalRatio).toBeCloseTo(answer.whatIf.bonus.starterPack, 12)
  })

  it('refuses a field the input does not have, rather than ignoring it', async () => {
    const misspelt = await run('coin_bonus', { path: savePath, overrides: { relicBonus: 0.2 } })
    expect(misspelt.error).toMatch(/no field "relicBonus"\. It has: .*relicCoinBonus/)

    const nested = await run('coin_bonus', { path: savePath, overrides: { coinsCard: { equiped: true } } })
    expect(nested.error).toMatch(/"coinsCard" has no field "equiped"/)
  })

  it('says so when the formula cannot price the input', async () => {
    const noTier = await run('coin_bonus', { path: savePath, tier: 999 })
    expect(noTier.error).toMatch(/tier 999/)

    const badCard = await run('coin_bonus', { path: savePath, overrides: { coinsCard: { equipped: true, level: 12 } } })
    expect(badCard.error).toMatch(/what-if could not be priced/)
  })
})

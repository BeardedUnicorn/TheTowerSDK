import { describe, expect, it } from 'vitest'
import { readToolExportJson } from '../../src/save/access/json'
import { readCardsFromSaveRoot } from '../../src/save/cards/read'
import { readCurrenciesFromSaveRoot } from '../../src/save/currencies/read'
import { readEventsFromSaveRoot } from '../../src/save/events/read'
import { readExportInfoFromSaveRoot } from '../../src/save/export-info/read'
import { readLabsFromSaveRoot } from '../../src/save/labs/read'
import { readLifetimeBreakdownFromSaveRoot } from '../../src/save/lifetime/breakdown'
import { readLifetimeFromSaveRoot } from '../../src/save/lifetime/read'
import { readMilestonesFromSaveRoot } from '../../src/save/milestones/read'
import { readModuleEconomyFromSaveRoot } from '../../src/save/modules/economy'
import { readModulesFromSaveRoot } from '../../src/save/modules/read'
import { readPerkChoicesFromSaveRoot } from '../../src/save/perks/read'
import { readGlobalPresetsFromSaveRoot } from '../../src/save/presets/read'
import { readTierRecordsFromSaveRoot } from '../../src/save/tier-records/read'
import { readTournamentsFromSaveRoot } from '../../src/save/tournaments/read'
import { readWorkshopUnlocksFromSaveRoot } from '../../src/save/workshop/unlocks'
import { readWorkshopFromSaveRoot } from '../../src/save/workshop/read'
import { readBotsFromSaveRoot } from '../../src/save/bots/read'

/*
 * A synthetic official export, shaped like the v29.2 one (build 1286, data version 35): the same
 * key names, list lengths and layouts, none of a real player's values. Every case here was read
 * wrongly, or not at all, before.
 */
const tierList = (values: Record<number, number>, length = 40) =>
  Array.from({ length }, (_, tier) => values[tier] ?? 0)
const flat = (presets: number, width: number, fill: (preset: number, slot: number) => unknown) =>
  Array.from({ length: presets * width }, (_, index) => fill(Math.floor(index / width), index % width))
const assistSlot = (type: number) => ({
  Unlocked: false, Type: type, EquippedModule: null, UniqueEffectEfficiencyLevel: 0,
  MainEffectEfficiencyLevel: 0, SubstatEfficiencyLevel: 0, Level: 0, CoinsSpent: 0, ShardsSpent: 0,
})

const EXPORT = {
  ExportVersion: 1,
  ExportedAt: '2026-11-18T22:00:00.000Z',
  VersionNumber: 1286,
  DataVersion: 35,
  Coins: 2.5e8, Gems: 276, Stones: 4, Medals: 62, Cells: 18959, Keys: 0, Tokens: 35, Bits: 339,
  ModuleCannonShards_v2: 7339, ModuleArmorShards_v2: 7821, ModuleGeneratorShards_v2: 3559,
  ModuleCoreShards_v2: 11335, ModuleRerollCurrency_v2: 4295, ModuleTickets: 10,
  ModuleRerollCurrencyLifetime_v2: 136862, ModuleCannonShardsLifetime_v2: 900,
  CurrencyEarnedThisCycle: { Currencies: { coin: 7.7e9, gem: 2208, module_reroll: 16765 } },
  CurrencySpentThisCycle: { Currencies: { coin: 9.6e9, stone: 116 } },
  ModuleEquipped: [null, null, null, null],
  AssistModuleSlots: [0, 1, 2, 3].map(assistSlot),
  AssistModulesAvailable: false,
  ModulePity: 46, ModuleRarePity: 0,
  SlotLevels: [80, 80, 88, 70], SlotCoinsSpent: [1.3e9, 1.3e9, 4.1e9, 3e8], SlotShardsSpent: [10595, 10595, 14595, 7095],
  ModulePresets: [{ PresetName: 'Preset 1', PrimaryModuleGuids: ['a', 'b', 'c', 'd'], AssistModuleGuids: [null, null, null, null] }],
  CurrentModulePreset: 0,
  CannonSubstatBans: [], CannonAutoRerollSubstats: [6, 8], ArmorAutoRerollSubstats: [19],
  TotalGemsSpentOnModules: 580, CommonModulesObtained: 1222, TotalModulesShattered: 1222, TotalMergesDone: 0,
  UpgradeWorkshopLevel: tierList({}, 20), UpgradeWorkshopDefenseLevel: tierList({}, 20), UpgradeWorkshopUtilityLevel: tierList({}, 20),
  EnhancementLevel: tierList({}, 20), EnhancementDefenseLevel: tierList({}, 20), EnhancementUtilityLevel: tierList({}, 20),
  PresetUpgradeWorkshopLevel: flat(5, 20, (preset, slot) => (slot === 0 ? 800 + preset : 0)),
  PresetUpgradeWorkshopDefenseLevel: flat(5, 20, () => 0),
  PresetUpgradeWorkshopUtilityLevel: flat(5, 20, () => 0),
  PresetEnhancementLevel: flat(5, 20, () => 0),
  PresetEnhancementDefenseLevel: flat(5, 20, () => 0),
  PresetEnhancementUtilityLevel: flat(5, 20, () => 0),
  WorkshopPresetName: ['A', 'B', 'C', 'D', 'E'],
  CurrentWorkshopPreset: 0,
  UpgradeTierUnlocked: tierList({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }, 20).map(Boolean),
  UpgradeDefenseTierUnlocked: tierList({ 0: 1, 1: 1 }, 20).map(Boolean),
  UpgradeUtilityTierUnlocked: tierList({}, 20).map(Boolean),
  UpgradesLockedFreeUpgrades: tierList({ 1: 1 }, 20).map(Boolean),
  PresetName: ['Push', 'Farm', 'Tournament', 'T12', 'Dissonant'],
  CurrentPreset: 1,
  SlotPresetCardInt: flat(5, 28, (preset, slot) => (preset === 1 && slot < 2 ? [6, 19][slot] : 0)),
  SlotPresetCardAssignedBool: flat(5, 28, (preset, slot) => preset === 1 && slot < 2),
  ResearchLevel: Array.from({ length: 260 }, (_, index) => (index === 36 ? 53 : index === 23 ? 56 : 1)),
  ResearchPercentComplete: Array.from({ length: 260 }, (_, index) => (index === 23 ? 0.86 : 0)),
  ResearchCompleteDate: Array.from({ length: 260 }, (_, index) => (
    index === 23 ? '2026-11-19T18:40:00.000Z' : '0001-01-01T00:00:00.000Z')),
  LabResearchInt: [23, -1, -1, -1, -1],
  LabActiveBool: [true, false, false, false, false],
  LabLevel: [0, 0, 0, 0, 0],
  LabSpeedUpSpeed: [2, 2, 2, 2, 2],
  LabSpeedUpRemainingSeconds: [0, 0, 0, 0, 0],
  CompletedLabs: [{ dateCompleted: '2025-12-27T06:08:36.497Z', labNumber: 30, level: 1 }],
  BannedPerksIndex: [49, 45, -1, -1, -1, -1, -1, -1],
  BotPresetName: ['Preset 1', 'Preset 2', 'Preset 3', 'Preset 4', 'Preset 5'],
  CurrentBotPreset: 4,
  FlameBotPresets: Array.from({ length: 5 }, () => ({ Unlocked: true, Active: true, Levels: [1, 1, 1, 1], SelectedLevels: [1, 1, 1, 1] })),
  LeagueID: 2, HighestLeague: 2, TournamentJoined: false, Playing: false,
  TournamentRecords: [{ TournamentNumber: 318, Date: '2026-11-18T00:00:00.000Z', LeagueID: 2, Wave: 500, Rank: 0 }],
  LastEventNumber: 100, TotalMedalsCurrentEvent: 570,
  EventRecords: [{ EventNumber: 100, Date: '2026-11-18T03:13:48.413Z', Medals: 570, EventName: 'RAINFALL', MedalsSpent: 1100, RelicsUnlocked: [326], UID: 'x' }],
  MilestonesPremiumUnlocked: Array.from({ length: 8 }, () => false),
  MilestonesRewardClaimed: Array.from({ length: 575 }, (_, index) => index >= 13 * 23 && index < 13 * 23 + 6),
  MilestonesRewardPremiumClaimed: Array.from({ length: 575 }, () => false),
  GlobalPresets: Array.from({ length: 6 }, (_, index) => ({ PresetName: `Preset ${index + 1}`, WorkshopIndex: 0, CardsIndex: 1, BotsIndex: 0, ModulesIndex: 0, GuardiansIndex: 0 })),
  CurrentGlobalPreset: 0, TierPreset: 5, TournamentPreset: 5, DissonantPreset: 5,
  CurrentTier: 7,
  HighestWaveThisTier: tierList({ 7: 2510, 13: 62 }),
  HighestWavePerTierThisCycle: tierList({ 7: 2510 }),
  RoundsStartedThisTier: tierList({ 7: 116, 13: 7 }),
  HighestCoinsEarnedThisTier: tierList({ 7: 1e9 }),
  HighestCellsEarnedThisTier: tierList({ 7: 300 }),
  TotalEnemiesDestroyedByThorn: 12, TotalEnemiesDestroyedBoss: 3, TotalDamageByDeathWave: 5e12,
  TotalCoinsEarnedFromKills: 7e11, TotalCellsEarned_v2: 2e5, TotalCellsSpent_v2: 1.8e5, PlayTime: 7515349.96,
}

const root = readToolExportJson(new TextEncoder().encode(JSON.stringify(EXPORT)))!

describe('a v29.2 official export', () => {
  it('names its build and is one this SDK was checked against', () => {
    expect(readExportInfoFromSaveRoot(root)).toMatchObject({ versionNumber: 1286, dataVersion: 35, checked: true, warnings: [] })
    const newer = readExportInfoFromSaveRoot({ ...root, dataVersion: 36 })!
    expect(newer.checked).toBe(false)
    expect(newer.warnings.join(' ')).toMatch(/renamed fields/)
  })

  it('reads the _v2 shard balances and does not invent the auto-shatter toggles', () => {
    const modules = readModulesFromSaveRoot(root)!
    expect(modules.shards).toMatchObject({ cannon: 7339, armor: 7821, generator: 3559, core: 11335, rerollCurrency: 4295 })
    expect(modules.shards.autoShatter).toBeNull()
    expect(modules.equipped.filter(item => item.role === 'assist')).toEqual([])
  })

  it('reads lifetime dice from the _v2 key', () => {
    expect(readLifetimeFromSaveRoot(root)!.values.rerollShardsEarned).toBe('136.862K')
  })

  it('reads all five workshop presets from the flat lists', () => {
    const workshop = readWorkshopFromSaveRoot(root)!
    expect(workshop.presets).toHaveLength(5)
    expect(workshop.presets.map(preset => Object.values(preset.levels)[0])).toEqual([800, 801, 802, 803, 804])
  })

  it('reads card presets from the flat lists', () => {
    const slots = readCardsFromSaveRoot(root)!.presetSlots
    expect(slots).toHaveLength(5 * 28)
    expect(slots.filter(slot => slot.cardIndex !== null)).toEqual([
      expect.objectContaining({ presetIndex: 1, slotIndex: 0, cardIndex: 6 }),
      expect.objectContaining({ presetIndex: 1, slotIndex: 1, cardIndex: 19 }),
    ])
  })

  it('times a lab in progress by the game\'s own finish date', () => {
    const labs = readLabsFromSaveRoot(root)!
    const queued = labs.activeQueue[0].research!
    expect(queued.completeDate).toBe('2026-11-19T18:40:00.000Z')
    expect(queued.remainingSeconds).toBe(20 * 3600 + 40 * 60)
    expect(labs.researches[0].completeDate).toBeNull()
    expect(labs.completions).toEqual([{ researchIndex: 30, level: 1, completedAt: '2025-12-27T06:08:36.497Z' }])
  })

  it('does not ban the empty-slot marker', () => {
    expect(readPerkChoicesFromSaveRoot(root)!.bannedIndices).toEqual([45, 49])
  })

  it('reads every bot preset the save holds', () => {
    const bots = readBotsFromSaveRoot(root)!
    expect(bots.presets).toHaveLength(5)
    expect(bots.currentPreset).toBe(4)
  })

  it('reads balances and this cycle\'s flows', () => {
    const currencies = readCurrenciesFromSaveRoot(root)!
    expect(currencies.balances).toMatchObject({ gems: 276, bits: 339, rerollShards: 4295, coreShards: 11335, moduleTickets: 10 })
    expect(currencies.earnedThisCycle).toEqual({ coin: 7.7e9, gem: 2208, module_reroll: 16765 })
    expect(currencies.spentThisCycle.stone).toBe(116)
  })

  it('reads the league by its 0-based id and the tournament record', () => {
    const tournaments = readTournamentsFromSaveRoot(root)!
    expect(tournaments.league).toBe('Gold')
    expect(tournaments.records).toEqual([{ number: 318, date: '2026-11-18T00:00:00.000Z', league: 'Gold', leagueId: 2, wave: 500, rank: 0 }])
  })

  it('reads events with the relics each unlocked', () => {
    expect(readEventsFromSaveRoot(root)!.records[0]).toMatchObject({ name: 'RAINFALL', medals: 570, relicsUnlocked: [326] })
  })

  it('reads milestone claims by tier, block 0 empty', () => {
    const milestones = readMilestonesFromSaveRoot(root)!
    expect(milestones.slotsPerTier).toBe(23)
    expect(milestones.tiers).toEqual([{ tier: 13, claimedSlots: [0, 1, 2, 3, 4, 5], premiumClaimedSlots: [], premiumUnlocked: false }])
  })

  it('reads Global Presets as stored', () => {
    const presets = readGlobalPresetsFromSaveRoot(root)!
    expect(presets.presets).toHaveLength(6)
    expect(presets.presets[0].cards).toBe(1)
    expect(presets.tierPreset).toBe(5)
  })

  it('reads per-tier records by tier number', () => {
    const records = readTierRecordsFromSaveRoot(root)!
    expect(records.currentTier).toBe(7)
    expect(records.tiers).toEqual([
      { tier: 7, highestWave: 2510, highestWaveThisCycle: 2510, roundsStarted: 116, highestCoinsEarned: 1e9, highestCellsEarned: 300 },
      { tier: 13, highestWave: 62, highestWaveThisCycle: null, roundsStarted: 7, highestCoinsEarned: null, highestCellsEarned: null },
    ])
  })

  it('reads the module economy', () => {
    const economy = readModuleEconomyFromSaveRoot(root)!
    expect(economy).toMatchObject({ pity: 46, slotLevels: [80, 80, 88, 70], assistModulesAvailable: false, merges: 0 })
    expect(economy.assistSlots.map(slot => [slot.category, slot.unlocked])).toEqual([
      ['Cannon', false], ['Armor', false], ['Generator', false], ['Core', false],
    ])
    expect(economy.autoRerollSubstats).toMatchObject({ Cannon: [6, 8], Armor: [19], Generator: [], Core: [] })
    expect(economy.lifetimeShards).toMatchObject({ cannon: 900, reroll: 136862 })
    expect(economy.presets[0].primaryModuleGuids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads lifetime breakdowns', () => {
    const breakdown = readLifetimeBreakdownFromSaveRoot(root)!
    expect(breakdown.killsBySource.thorns).toBe(12)
    expect(breakdown.killsByEnemyType.boss).toBe(3)
    expect(breakdown.damageBySource.deathWave).toBe(5e12)
    expect(breakdown.currencies.cells).toEqual({ earned: 2e5, spent: 1.8e5, bought: null })
    expect(breakdown.other.playTimeSeconds).toBeCloseTo(7515349.96)
  })

  it('counts workshop rows unlocked and names stats locked against free upgrades', () => {
    const unlocks = readWorkshopUnlocksFromSaveRoot(root)!
    expect(unlocks.upgradeTiersUnlocked).toEqual({ attack: 5, defense: 2, utility: 0 })
    expect(unlocks.freeUpgradeLocked).toEqual(['Attack Speed'])
    expect(unlocks.warnings).toEqual([])
  })
})

describe('fields an export adds', () => {
  it('names a top-level key the SDK has never seen', () => {
    const info = readExportInfoFromSaveRoot({ ...root, moduleCannonShards_v3: 1 })!
    expect(info.unknownKeys).toEqual(['moduleCannonShards_v3'])
    expect(info.warnings.join(' ')).toMatch(/moduleCannonShards_v3/)
  })
})

import {
	ALL_PERKS,
	BOT_UPGRADES_DATA,
	CARD_TEMPLATES,
	GLOSSARY_NAME_ROWS,
	LAB_CATALOG,
	MILESTONE_REWARD_ROWS,
	MODULE_SUBSTATS_CLUSTER,
	MODULE_TEMPLATES,
	RELIC_TEMPLATES,
	TIER_BATTLE_CONDITION_DEFINITIONS,
	VAULT_HARMONY_IMPORT_CATALOG,
	VAULT_POWER_IMPORT_CATALOG,
	buildGuardianDefinitions,
	getWorkshopEnhancementDefinitions,
	getWorkshopStatDefinitions,
	uwStoneChartData
} from '@beardedunicorn/thetowersdk/data';
import { listChartableSeries } from '@beardedunicorn/thetowersdk/charts';
import * as mechanics from '@beardedunicorn/thetowersdk/mechanics';

function countUwStats(): number {
	return Object.values(uwStoneChartData).reduce(
		(sum, weapon) => sum + (weapon.stats?.length ?? 0),
		0
	);
}

function countBotStats(): number {
	return BOT_UPGRADES_DATA.reduce((sum, bot) => {
		const main = Object.keys(bot.stats ?? {}).length;
		const plus = Object.keys(bot.plus?.stats ?? {}).length;
		return sum + main + plus;
	}, 0);
}

function countLabLevels(): number {
	return LAB_CATALOG.reduce((sum, lab) => sum + lab.levels.length, 0);
}

function countGuardianChipStats(): number {
	return buildGuardianDefinitions().reduce(
		(sum, guardian) => sum + Object.keys(guardian.stats ?? {}).length,
		0
	);
}

/** Callable exports from `@beardedunicorn/thetowersdk/mechanics` (ready-to-use formulas). */
function countMechanicsFormulas(): number {
	return Object.values(mechanics).filter((value) => typeof value === 'function').length;
}

/**
 * Every chart the shipped game data can produce, not the handful anyone has
 * hand-authored. One chart = one measurable field plotted across a level range.
 *
 * Read from the package's own listing of series with at least two points, so the number here is
 * the number of curves `getChartSeries` can return. It used to be recounted in this file by a copy of the walk, and the
 * two copies had already drifted on how a bot stat counts.
 */
export function countChartableSeries(): number {
	return listChartableSeries().length;
}

/**
 * Total upgrade levels across every stat of a mechanic.
 *
 * The counts on the home page used to be "how many stats exist" — 47 for the whole of workshop, 36
 * for all nine ultimate weapons. Those undersell the package by orders of magnitude: what it
 * actually carries is every level of every stat, and workshop alone is 31,079 of them. A stat is
 * one row in a table; a level is one row of data you would otherwise have to enter by hand.
 *
 * Ladders come in two shapes across the catalogs — an array of level records, or an object keyed by
 * level number — so both are counted. Anything else contributes nothing rather than guessing.
 */
function countLevels(ladder: unknown): number {
	if (Array.isArray(ladder)) return ladder.length;
	if (ladder && typeof ladder === 'object') return Object.keys(ladder).length;
	return 0;
}

const sumLevels = <T>(items: readonly T[], ladders: (item: T) => unknown[]): number =>
	items.reduce(
		(total, item) =>
			total + ladders(item).reduce<number>((sum, ladder) => sum + countLevels(ladder), 0),
		0
	);

/** Every level of every ultimate weapon stat — nine weapons, four stats each. */
function countUwLevels(): number {
	return sumLevels(Object.values(uwStoneChartData), (weapon) =>
		(weapon.stats ?? []).map((stat) => stat.levels)
	);
}

/**
 * Bots carry a base stat block and a "plus" block. Each stat is a formula over levels
 * 0..maxLevel, so it holds `maxLevel + 1` levels.
 */
function countBotLevels(): number {
	return BOT_UPGRADES_DATA.reduce(
		(total, bot) =>
			total +
			[...Object.values(bot.stats ?? {}), ...Object.values(bot.plus?.stats ?? {})].reduce(
				(sum, stat) => sum + stat.maxLevel + 1,
				0
			),
		0
	);
}

function countWorkshopLevels(): number {
	return sumLevels(getWorkshopStatDefinitions(), (stat) => [stat.levels]);
}

function countGuardianLevels(): number {
	return sumLevels(buildGuardianDefinitions(), (guardian) =>
		Object.values(guardian.stats ?? {}).map((stat) => stat?.levels)
	);
}

/** Cards level twice: the card itself, and its mastery, on separate ladders. */
function countCardLevels(): number {
	return sumLevels(CARD_TEMPLATES, (card) => [card.levelValues, card.masteryValues]);
}

/** Counts from the installed package — prefer leaf data over parent totals. */
export const sdkStats = {
	labs: LAB_CATALOG.length,
	labLevels: countLabLevels(),
	workshopStats: getWorkshopStatDefinitions().length,
	workshopEnhancements: getWorkshopEnhancementDefinitions().length,
	modules: MODULE_TEMPLATES.length,
	moduleSubstats: MODULE_SUBSTATS_CLUSTER.length,
	cards: CARD_TEMPLATES.length,
	relics: RELIC_TEMPLATES.length,
	bots: BOT_UPGRADES_DATA.length,
	botStats: countBotStats(),
	guardianChipStats: countGuardianChipStats(),
	vaultNodes: VAULT_HARMONY_IMPORT_CATALOG.length + VAULT_POWER_IMPORT_CATALOG.length,
	ultimateWeapons: Object.keys(uwStoneChartData).length,
	uwStats: countUwStats(),
	perks: ALL_PERKS.length,
	battleConditions: TIER_BATTLE_CONDITION_DEFINITIONS.length,
	milestoneRewards: MILESTONE_REWARD_ROWS.length,
	glossaryNames: GLOSSARY_NAME_ROWS.length,
	formulas: countMechanicsFormulas(),
	chartableSeries: countChartableSeries(),

	// Level totals — see `countLevels`. These are what the home page shows.
	workshopLevels: countWorkshopLevels(),
	uwLevels: countUwLevels(),
	botLevels: countBotLevels(),
	guardianLevels: countGuardianLevels(),
	cardLevels: countCardLevels()
} as const;

/**
 * Thousands separators, pinned to `en-US`.
 *
 * These numbers are rendered at build time on whatever machine runs the build, and the site is
 * written in American English throughout. Left to the host locale, `31,079` would ship as `31.079`
 * from a German CI runner — a hundredfold understatement that looks like a typo, not a bug.
 */
const grouped = (value: number): string => value.toLocaleString('en-US');

/** Every level total added together, for the one figure that stands for the rest. */
export const totalUpgradeLevels =
	sdkStats.workshopLevels +
	sdkStats.labLevels +
	sdkStats.guardianLevels +
	sdkStats.uwLevels +
	sdkStats.botLevels +
	sdkStats.cardLevels;

/**
 * Home page counts.
 *
 * Level totals wherever a mechanic has ladders, plain counts only where it genuinely has none —
 * relics, vault nodes, perks and battle conditions are flat catalogs, and labelling a count as
 * though it were a level total would be the same overselling in the other direction.
 *
 * Labels say "levels" when that is what the number is. The previous set said "Workshop Stats" over
 * a count of 47, which was accurate but read as the whole of workshop being 47 things.
 */
export const packageContents = [
	{ value: grouped(sdkStats.workshopLevels), label: 'Workshop levels' },
	{ value: grouped(sdkStats.labLevels), label: 'Lab levels' },
	{ value: grouped(sdkStats.guardianLevels), label: 'Guardian levels' },
	{ value: grouped(sdkStats.chartableSeries), label: 'Chartable series' },
	{ value: grouped(sdkStats.uwLevels), label: 'UW levels' },
	{ value: grouped(sdkStats.formulas), label: 'Formulas' },
	{ value: grouped(sdkStats.botLevels), label: 'Bot levels' },
	{ value: grouped(sdkStats.cardLevels), label: 'Card levels' },
	{ value: grouped(sdkStats.milestoneRewards), label: 'Milestone rewards' },
	{ value: grouped(sdkStats.glossaryNames), label: 'Glossary terms' },
	{ value: grouped(sdkStats.relics), label: 'Relics' },
	{ value: grouped(sdkStats.vaultNodes), label: 'Vault nodes' },
	{ value: grouped(sdkStats.moduleSubstats), label: 'Module substats' },
	{ value: grouped(sdkStats.perks), label: 'Perks' },
	{ value: grouped(sdkStats.battleConditions), label: 'Battle conditions' }
] as const;

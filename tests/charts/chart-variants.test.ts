import { describe, expect, it } from 'vitest'

import { SHARED_CHART_REGISTRY } from '../../src/charts/registry/data'
import { resolveCanonicalToolDataset } from '../../src/charts/tables/lookup'
import { BOT_UPGRADES_DATA, ELITE_SPAWN_CHANCE_ROWS, MAX_CAMPAIGN_TIER } from '../../src/data'

/**
 * Every chart id has to open its own table.
 *
 * A chart id carries its variant after the second colon — `bots:upgrades-and-costs:golden-bot` —
 * and that is what the MCP server and the WASM module hand to the resolver. The bot resolver
 * matched a bot's display name only, missed every slug, and fell back to the first bot in the
 * catalog: three charts titled for Golden, Thunder and Amplify Bot all served Flame Bot's rows.
 * The existing check asked only whether a dataset had columns, which a wrong table has too.
 */

/** The arguments a chart id implies, exactly as `chart_rows` derives them. */
const variantOf = (pathId: string): string[] => pathId.split(':').slice(2)

describe('every chart id resolves to a table', () => {
  it('resolves each id from its own variant segment', () => {
    for (const entry of SHARED_CHART_REGISTRY) {
      const dataset = resolveCanonicalToolDataset(entry.rendererKey, variantOf(entry.pathId))
      expect(dataset, entry.pathId).not.toBeNull()
      expect(dataset?.columns.length, entry.pathId).toBeGreaterThan(0)
    }
  })
})

describe('a bot chart shows its own bot', () => {
  const botCharts = SHARED_CHART_REGISTRY.filter(entry => entry.rendererKey === 'bot-upgrades')

  it('has a chart for every bot in the catalog', () => {
    const titled = botCharts.map(entry => entry.title.replace('Bot Upgrades: ', '')).sort()
    expect(titled).toEqual(BOT_UPGRADES_DATA.map(bot => bot.label).sort())
  })

  it('titles each table with the bot its id names', () => {
    for (const entry of botCharts) {
      const label = entry.title.replace('Bot Upgrades: ', '')
      const dataset = resolveCanonicalToolDataset('bot-upgrades', variantOf(entry.pathId))
      expect(dataset?.title, entry.pathId).toBe(`${label} Upgrades`)
    }
  })

  it('gives each bot a different table from the others', () => {
    // The fault this guards served one table five times. Several bots share stat names, so the
    // comparison is over the rows, not the column labels.
    const tables = botCharts.map(entry =>
      JSON.stringify(resolveCanonicalToolDataset('bot-upgrades', variantOf(entry.pathId))?.rows))
    expect(new Set(tables).size).toBe(botCharts.length)
  })

  it('refuses a bot it does not know instead of answering with another', () => {
    expect(resolveCanonicalToolDataset('bot-upgrades', ['no-such-bot'])).toBeNull()
    expect(resolveCanonicalToolDataset('bot-upgrades', [])).toBeNull()
  })

  it('still takes a display name', () => {
    expect(resolveCanonicalToolDataset('bot-upgrades', ['Golden Bot'])?.title).toBe('Golden Bot Upgrades')
  })
})

describe('the elite spawn chance chart shows every tier', () => {
  const dataset = resolveCanonicalToolDataset('elite-spawn-chance', [])
  const labels = dataset?.columns.map(column => column.label) ?? []

  it('has one labelled column per cell of a source row', () => {
    const width = ELITE_SPAWN_CHANCE_ROWS[0]?.length ?? 0
    expect(labels).toHaveLength(width)
    expect(labels.every(label => label.length > 0)).toBe(true)
  })

  it('labels a column for every campaign tier, then the two reference columns', () => {
    expect(labels.slice(0, 2)).toEqual(['Double%', 'Single%'])
    expect(labels[2]).toBe('T1')
    expect(labels[1 + MAX_CAMPAIGN_TIER]).toBe(`T${MAX_CAMPAIGN_TIER}`)
    expect(labels.slice(2 + MAX_CAMPAIGN_TIER)).toEqual(['leftRef', 'rightRef'])
  })

  it('carries the last tier\'s thresholds from the source table', () => {
    const lastTierKey = `c${1 + MAX_CAMPAIGN_TIER}`
    const sourceRow = ELITE_SPAWN_CHANCE_ROWS[2] ?? []
    expect(dataset?.rows[2]?.[lastTierKey]).toBe(sourceRow[1 + MAX_CAMPAIGN_TIER])
    expect(Number(dataset?.rows[2]?.[lastTierKey])).toBeGreaterThan(0)
  })

  it('shows a missing value as blank, never as the word', () => {
    const cells = (dataset?.rows ?? []).flatMap(row => Object.values(row))
    expect(cells).not.toContain('undefined')
  })
})

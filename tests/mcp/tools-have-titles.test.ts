/**
 * Every tool has a name a person can read.
 *
 * A client shows `annotations.title` in its tool list and in the prompt that asks whether a tool
 * may run. Without one it shows `sdk_sandbox_run`. The titles are hand-written, so a new tool has
 * none until someone writes it, and this is what notices.
 */
import { describe, expect, it } from 'vitest'
// @ts-expect-error — the MCP server is plain ESM JavaScript with no declarations.
import { TOOLS, TOWER_ORACLE_TOOLS } from '../../mcp/server.mjs'
// @ts-expect-error — as above.
import { TITLES, annotationsFor } from '../../mcp/tool-traits.mjs'
// @ts-expect-error — as above.
import { PROMPTS } from '../../mcp/prompts.mjs'

const names = [...Object.keys(TOOLS as object), ...Object.keys(TOWER_ORACLE_TOOLS as object)]

describe('tool titles', () => {
  it('gives every tool one', () => {
    expect(names.filter(name => !(TITLES as Record<string, string>)[name])).toEqual([])
  })

  it('gives no two tools the same one', () => {
    const titles = names.map(name => (TITLES as Record<string, string>)[name])
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('sends it with the tool', () => {
    expect(annotationsFor('calc_run')).toMatchObject({ title: 'Run a calculator', readOnlyHint: true })
  })
})

describe('prompts', () => {
  const prompts = PROMPTS as Record<string, { title: string, description: string, arguments?: { name: string }[], text: (args: Record<string, string>) => string }>

  it('name only tools that exist', () => {
    for (const [name, prompt] of Object.entries(prompts)) {
      const args = Object.fromEntries((prompt.arguments ?? []).map(argument => [argument.name, 'Death Wave']))
      const mentioned = [...prompt.text(args).matchAll(/`([a-z_]+)`/g)].map(match => match[1]!)
        .filter(word => word !== 'path')
      expect(mentioned.length, name).toBeGreaterThan(0)
      expect(mentioned.filter(tool => !names.includes(tool)), name).toEqual([])
    }
  })

  it('reads without its optional arguments', () => {
    expect(prompts.what_to_upgrade_next!.text({})).toContain('What should I upgrade next in The Tower?')
  })
})

/**
 * The Claude Desktop extension's manifest.
 *
 * The manifest is written at build time and nothing read it afterwards except the bundle CLI's
 * schema check, which is satisfied by a setting the server never receives and by a version that
 * names the wrong release. These are the things the schema cannot see.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — the build scripts are plain ESM JavaScript with no declarations.
import { buildManifest, bundleVersion, parseAuthor } from '../../scripts/mcpb-manifest.mjs'
import { MCP, PACKAGE_ROOT } from '../helpers/paths'

const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string }
const manifest = buildManifest(pkg) as {
  version: string
  author: { name: string }
  privacy_policies: string[]
  server: { mcp_config: { env: Record<string, string> } }
  user_config: Record<string, { required: boolean, default: unknown, title: string, description: string }>
}
const server = readFileSync(path.join(MCP, 'server.mjs'), 'utf8')

describe('the extension manifest', () => {
  it('wires every setting to the server, and offers no setting it does not wire', () => {
    const used = Object.values(manifest.server.mcp_config.env)
      .flatMap(value => [...value.matchAll(/\$\{user_config\.([a-z_]+)\}/g)].map(match => match[1]))
    expect(used.sort()).toEqual(Object.keys(manifest.user_config).sort())
  })

  it('sets only environment variables the server reads', () => {
    for (const name of Object.keys(manifest.server.mcp_config.env)) {
      expect(server, name).toContain(`process.env.${name}`)
    }
  })

  it('leaves no optional setting without a default', () => {
    /* An unset optional setting reaches the server as the literal text `${user_config.name}`. */
    for (const [name, setting] of Object.entries(manifest.user_config)) {
      expect(setting.required, name).toBe(false)
      expect(setting.default, name).toBeDefined()
    }
  })

  it('names its author and its privacy policy', () => {
    expect(manifest.author.name).toBeTruthy()
    expect(manifest.privacy_policies).toHaveLength(1)
    expect(parseAuthor('A Person <a@example.com> (https://example.com)'))
      .toEqual({ name: 'A Person', email: 'a@example.com', url: 'https://example.com' })
  })
})

describe('the version a bundle carries', () => {
  it('is the package version on the release tag', () => {
    expect(bundleVersion('2.0.0', { tagsAtHead: ['v2.0.0'], shortSha: 'abc1234' })).toBe('2.0.0')
  })

  it('names the commit anywhere else', () => {
    expect(bundleVersion('2.0.0', { tagsAtHead: [], shortSha: 'abc1234' })).toBe('2.0.0-dev.abc1234')
    expect(bundleVersion('2.0.0', { tagsAtHead: ['v1.7.2'], shortSha: 'abc1234' })).toBe('2.0.0-dev.abc1234')
  })

  it('is the package version where there is no repository to ask', () => {
    expect(bundleVersion('2.0.0', {})).toBe('2.0.0')
  })
})

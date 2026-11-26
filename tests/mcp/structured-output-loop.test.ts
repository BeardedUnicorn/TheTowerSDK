/**
 * What the stdio loop does with an answer, whatever tool gave it.
 *
 * `structured-output.test.ts` holds the real tools to their schemas, and every one of them returns
 * an object that fits. So the cases the loop exists to handle never happen there: an array, a bare
 * string, a number JSON cannot carry, an answer its own schema rejects. They are the ones a client
 * would report as a failed call, so they are given to the loop here by tools made for the purpose.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MCP } from '../helpers/paths'

const FITS = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] }

/** A server with one tool for each kind of answer, started with whatever environment is given. */
const SERVER = `
  import { runStdioMcp } from ${JSON.stringify(path.join(MCP, 'run-stdio.mjs'))}
  const FITS = ${JSON.stringify(FITS)}
  const tool = (run, outputSchema) => ({ description: 'x', inputSchema: { type: 'object', properties: {} }, run, ...(outputSchema ? { outputSchema } : {}) })
  runStdioMcp({ name: 'loop-test', version: '0', instructions: '', tools: {
    an_array: tool(() => [1, 2]),
    a_string: tool(() => 'plain'),
    a_null: tool(() => null),
    an_object: tool(() => ({ any: 'thing' })),
    not_a_number: tool(() => ({ ratio: 0 / 0 })),
    fits: tool(() => ({ count: 3, extra: true }), FITS),
    misfits: tool(() => ({ count: 'three' }), FITS),
    lost_its_number: tool(() => ({ count: 0 / 0 }), FITS),
    schema_but_array: tool(() => [3], FITS),
    says_error: tool(() => ({ error: 'no such thing', count: 3 }), FITS),
    throws: tool(() => { throw new Error('broke') }, FITS),
  } })
`

interface Result {
  isError?: boolean
  content: { type: string, text: string }[]
  structuredContent?: unknown
}
interface Reply { result?: Result & { tools?: { name: string, outputSchema?: unknown }[] }, error?: { code: number, message: string } }

/** Run one conversation with the server and return each reply, with what it wrote to stderr. */
async function converse(env: Record<string, string>, protocolVersion: string | null, calls: string[]) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', SERVER], { env: { ...process.env, TOWER_MCP_STRICT: '', ...env } })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  const replies = new Map<number, Reply>()
  const total = calls.length + 2
  const done = new Promise<void>((resolve) => {
    let buffer = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const message = JSON.parse(buffer.slice(0, newline)) as Reply & { id: number }
        buffer = buffer.slice(newline + 1)
        replies.set(message.id, message)
        if (replies.size === total) resolve()
      }
    })
  })
  const send = (id: number, method: string, params: Record<string, unknown>) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  /* `ping` stands in for `initialize` when the client is one that never negotiates. */
  if (protocolVersion) send(0, 'initialize', { protocolVersion })
  else send(0, 'ping', {})
  send(1, 'tools/list', {})
  calls.forEach((name, index) => send(index + 2, 'tools/call', { name, arguments: {} }))
  await done
  child.kill()
  return {
    stderr,
    listed: replies.get(1)!.result!.tools!,
    reply: (name: string) => replies.get(calls.indexOf(name) + 2)!,
  }
}

const EVERY = ['an_array', 'a_string', 'a_null', 'an_object', 'not_a_number', 'fits', 'misfits', 'lost_its_number', 'schema_but_array', 'says_error', 'throws']

describe('the stdio loop and structured output', () => {
  it('sends an object as structured content and anything else as text alone', async () => {
    const { reply, listed } = await converse({}, '2025-06-18', EVERY)

    expect(reply('an_object').result).toEqual({ content: [{ type: 'text', text: '{"any":"thing"}' }], structuredContent: { any: 'thing' } })
    expect(reply('an_array').result).toEqual({ content: [{ type: 'text', text: '[1,2]' }] })
    expect(reply('a_string').result).toEqual({ content: [{ type: 'text', text: '"plain"' }] })
    expect(reply('a_null').result).toEqual({ content: [{ type: 'text', text: 'null' }] })

    /* A schema is listed for the tools that declare one and for no other. */
    expect(listed.filter(tool => tool.outputSchema).map(tool => tool.name).sort())
      .toEqual(['fits', 'lost_its_number', 'misfits', 'says_error', 'schema_but_array', 'throws'])
    expect(listed.find(tool => tool.name === 'fits')!.outputSchema).toEqual(FITS)
  })

  it('carries a number JSON cannot hold as null in both, and says which', async () => {
    const { reply } = await converse({}, '2025-06-18', EVERY)
    const result = reply('not_a_number').result!
    expect(result.content[0]!.text).toBe('{"ratio":null}')
    expect(result.content[1]!.text).toContain('result.ratio = NaN')
    expect(result.structuredContent).toEqual({ ratio: null })
  })

  it('sends a failure as its flag and its text, whatever the schema', async () => {
    const { reply, stderr } = await converse({}, '2025-06-18', EVERY)
    expect(reply('says_error').result).toEqual({ isError: true, content: [{ type: 'text', text: '{"error":"no such thing","count":3}' }] })
    expect(reply('throws').result).toEqual({ isError: true, content: [{ type: 'text', text: 'throws failed: broke' }] })
    /* Neither is an answer outside its schema: a failure is not held to one. */
    expect(stderr).not.toMatch(/says_error|throws/)
  })

  it('still answers when an answer does not fit its schema, and says so in its log', async () => {
    const { reply, stderr } = await converse({}, '2025-06-18', EVERY)

    expect(reply('fits').result).toEqual({ content: [{ type: 'text', text: '{"count":3,"extra":true}' }], structuredContent: { count: 3, extra: true } })
    expect(stderr).not.toContain('] fits answered')

    expect(reply('misfits').result!.structuredContent).toEqual({ count: 'three' })
    expect(stderr).toContain('[loop-test] misfits answered outside its outputSchema: $.count: expected number, got string')

    /* The NaN is checked as it arrives, which is as null. */
    expect(reply('lost_its_number').result!.structuredContent).toEqual({ count: null })
    expect(stderr).toContain('lost_its_number answered outside its outputSchema: $.count: expected number, got null')

    expect(reply('schema_but_array').result).toEqual({ content: [{ type: 'text', text: '[3]' }] })
    expect(stderr).toContain('schema_but_array answered outside its outputSchema: $: expected object, got array')
  })

  it('refuses such an answer when told to be strict, which is how the suites run it', async () => {
    const { reply } = await converse({ TOWER_MCP_STRICT: '1' }, '2025-06-18', EVERY)
    for (const name of ['misfits', 'lost_its_number', 'schema_but_array']) {
      expect(reply(name).error, name).toMatchObject({ code: -32603 })
      expect(reply(name).error!.message, name).toContain(`${name} answered outside its outputSchema`)
    }
    expect(reply('fits').result!.structuredContent).toEqual({ count: 3, extra: true })
    expect(reply('says_error').result!.isError).toBe(true)
    expect(reply('throws').result!.isError).toBe(true)
  })

  it.each([['2025-03-26'], ['2024-11-05'], [null]])('sends revision %s the text and nothing new', async (revision) => {
    const modern = await converse({}, '2025-06-18', EVERY)
    const { reply, listed, stderr } = await converse({}, revision, EVERY)

    for (const tool of listed) expect(tool, tool.name).not.toHaveProperty('outputSchema')
    for (const name of EVERY) {
      expect(reply(name).result, name).not.toHaveProperty('structuredContent')
      expect(reply(name).result!.content, name).toEqual(modern.reply(name).result!.content)
      expect(reply(name).result!.isError, name).toBe(modern.reply(name).result!.isError)
    }
    /* Nothing structured was sent, so there was nothing to check against a schema. */
    expect(stderr).toBe('')
  })

  it('answers a client asking for a newer revision in the newest it speaks, structured', async () => {
    const { reply, listed } = await converse({}, '2026-07-28', ['fits'])
    expect(listed.find(tool => tool.name === 'fits')).toHaveProperty('outputSchema')
    expect(reply('fits').result).toHaveProperty('structuredContent')
  })
})

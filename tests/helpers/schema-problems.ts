/**
 * The part of JSON Schema the tool output schemas use, and no more.
 *
 * The server promises a client that `structuredContent` conforms to the tool's `outputSchema`, and
 * the only way to hold it to that is to check. A validator library would do it, and would be a
 * dependency of a package whose one dependency is `zod`; the schemas use six keywords, so this
 * reads those six and throws on any other, rather than passing a schema it does not understand.
 */

export interface JsonSchema {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
}

const KEYWORDS = new Set(['type', 'description', 'properties', 'required', 'items', 'enum'])

const typeOf = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value

const fits = (type: string, value: unknown): boolean =>
  type === 'integer' ? Number.isInteger(value) : typeOf(value) === type

/** Every way `value` fails `schema`, as `path: reason`. Empty means it conforms. */
export function schemaProblems(schema: JsonSchema, value: unknown, at = '$'): string[] {
  const unknown = Object.keys(schema).filter(keyword => !KEYWORDS.has(keyword))
  if (unknown.length > 0) throw new Error(`${at}: this checker does not read ${unknown.join(', ')}`)

  const problems: string[] = []
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!allowed.some(type => fits(type, value))) {
      return [`${at}: expected ${allowed.join(' | ')}, got ${typeOf(value)}`]
    }
  }
  if (schema.enum && !schema.enum.some(option => option === value)) {
    problems.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`)
  }
  if (typeOf(value) === 'object') {
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) problems.push(`${at}: \`${key}\` is required`)
    }
    for (const [key, spec] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        problems.push(...schemaProblems(spec, record[key], `${at}.${key}`))
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((entry, index) => problems.push(...schemaProblems(schema.items!, entry, `${at}[${index}]`)))
  }
  return problems
}

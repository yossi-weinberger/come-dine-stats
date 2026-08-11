import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Contestant, Dish, SourceRef } from '../lib/types'

const normalizedDir = new URL('../data/normalized/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const sourcePriority: Record<string, number> = { manual: 50, kan: 40, foodik: 38, wikipedia: 35, fandom: 30, rest: 28, wayback: 20, legacy: 10 }
const scalarFields = ['entryType','members','status','week','weekName','hostingOrder','age','city','region','occupation','relationshipStatus','gender','diet','score','placement','winner'] as const

type ScalarField = typeof scalarFields[number]
type EvidenceValue = { value: unknown; sources: SourceRef[] }
type Conflict = { key: string; field: ScalarField; values: EvidenceValue[] }
type Refinement = Conflict & {
  relation: 'incoming-more-specific' | 'existing-more-specific'
  preferredValue: unknown
}

function entityKey(c: Contestant) {
  return `${c.season}:${c.name.normalize('NFKC').replace(/[\s'״׳".-]+/g, '').toLowerCase()}`
}

function uniqSources(sources: SourceRef[]) {
  const map = new Map<string, SourceRef>()
  for (const source of sources) map.set(`${source.kind}:${source.url}`, source)
  return [...map.values()]
}

function priorityFor(sources: SourceRef[] = []) {
  return Math.max(0, ...sources.map((source) => sourcePriority[source.kind] ?? 0))
}

function normalizeWeekName(value: unknown) {
  if (typeof value !== 'string') return value
  return value
    .normalize('NFKC')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^ה(?=[\p{L}])/u, '')
}

function normalizeOccupation(value: unknown) {
  if (typeof value !== 'string') return value
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .replace(/["'״׳().,;:–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)אומנית(?=\s|$)/gu, '$1אמנית')
    .replace(/(^|\s)אומן(?=\s|$)/gu, '$1אמן')
}

function sameValue(field: ScalarField, a: unknown, b: unknown) {
  if (field === 'weekName') return JSON.stringify(normalizeWeekName(a)) === JSON.stringify(normalizeWeekName(b))
  if (field === 'occupation') return JSON.stringify(normalizeOccupation(a)) === JSON.stringify(normalizeOccupation(b))
  return JSON.stringify(a) === JSON.stringify(b)
}

function containsWholePhrase(longer: string, shorter: string) {
  return longer === shorter || longer.startsWith(`${shorter} `) || longer.endsWith(` ${shorter}`) || longer.includes(` ${shorter} `)
}

function occupationRefinement(a: unknown, b: unknown) {
  const left = normalizeOccupation(a)
  const right = normalizeOccupation(b)
  if (typeof left !== 'string' || typeof right !== 'string' || left === right) return undefined
  if (containsWholePhrase(right, left)) return 'incoming-more-specific' as const
  if (containsWholePhrase(left, right)) return 'existing-more-specific' as const
  return undefined
}

function refinementRelation(field: ScalarField, a: unknown, b: unknown) {
  if (field === 'occupation') return occupationRefinement(a, b)
  return undefined
}

function dishKey(dish: Dish) {
  const variant = dish.variant ?? 'standard'
  return `${dish.course}:${variant}:${dish.name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}`
}

function mergeDishes(current: Dish[], incoming: Dish[]) {
  const map = new Map(current.map((dish) => [dishKey(dish), dish]))
  for (const dish of incoming) {
    const key = dishKey(dish)
    const existing = map.get(key)
    if (!existing) map.set(key, dish)
    else map.set(key, {
      ...existing,
      variant: existing.variant ?? dish.variant ?? 'standard',
      label: existing.label || dish.label,
      description: existing.description || dish.description,
      tags: [...new Set([...(existing.tags ?? []), ...(dish.tags ?? [])])],
      sources: uniqSources([...(existing.sources ?? []), ...(dish.sources ?? [])]),
    })
  }
  return [...map.values()]
}

function mergeContestant(base: Contestant, incoming: Contestant, conflicts: Conflict[], refinements: Refinement[]) {
  const merged: Contestant = {
    ...base,
    sources: uniqSources([...base.sources, ...incoming.sources]),
    fieldSources: { ...(base.fieldSources ?? {}) },
    dishes: mergeDishes(base.dishes, incoming.dishes),
    episodeUrls: [...new Set([...(base.episodeUrls ?? []), ...(incoming.episodeUrls ?? [])])],
  }

  for (const field of scalarFields) {
    const left = base[field]
    const right = incoming[field]
    const leftSources = base.fieldSources?.[field] ?? base.sources
    const rightSources = incoming.fieldSources?.[field] ?? incoming.sources
    merged.fieldSources![field] = uniqSources([...(left == null ? [] : leftSources), ...(right == null ? [] : rightSources)])

    if (right == null || right === '') continue
    if (left == null || left === '') {
      ;(merged as any)[field] = right
      continue
    }
    if (sameValue(field, left, right)) continue

    const relation = refinementRelation(field, left, right)
    if (relation) {
      const preferredValue = relation === 'incoming-more-specific' ? right : left
      refinements.push({
        key: entityKey(base),
        field,
        relation,
        preferredValue,
        values: [{ value: left, sources: leftSources }, { value: right, sources: rightSources }],
      })
      ;(merged as any)[field] = preferredValue
      continue
    }

    conflicts.push({ key: entityKey(base), field, values: [{ value: left, sources: leftSources }, { value: right, sources: rightSources }] })
    if (priorityFor(rightSources) > priorityFor(leftSources)) (merged as any)[field] = right
  }

  return merged
}

async function maybeRead(name: string): Promise<Contestant[]> {
  try { return JSON.parse(await readFile(new URL(name, normalizedDir), 'utf8')) as Contestant[] }
  catch { return [] }
}

async function main() {
  await mkdir(reportsDir, { recursive: true })
  const inputs = [
    ...(await maybeRead('seed-contestants.json')),
    ...(await maybeRead('legacy-contestants.json')),
    ...(await maybeRead('fandom-contestants.json')),
    ...(await maybeRead('wikipedia-contestants.json')),
    ...(await maybeRead('kan-contestants.json')),
    ...(await maybeRead('supplemental-menu-contestants.json')),
    ...(await maybeRead('supplemental-profile-contestants.json')),
  ]
  const byKey = new Map<string, Contestant>()
  const conflicts: Conflict[] = []
  const refinements: Refinement[] = []

  for (const contestant of inputs) {
    const key = entityKey(contestant)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeContestant(existing, contestant, conflicts, refinements) : contestant)
  }

  const output = [...byKey.values()].sort((a, b) => a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999) || a.name.localeCompare(b.name, 'he'))
  await writeFile(new URL('contestants.json', normalizedDir), JSON.stringify(output, null, 2))
  await writeFile(new URL('conflicts.json', reportsDir), JSON.stringify(conflicts, null, 2))
  await writeFile(new URL('refinements.json', reportsDir), JSON.stringify(refinements, null, 2))
  console.log(`Merged ${inputs.length} source rows into ${output.length} competition entries; ${conflicts.length} conflicts and ${refinements.length} refinements preserved`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

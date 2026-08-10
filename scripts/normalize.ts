import { readFile, writeFile } from 'node:fs/promises'
import type { Contestant, Dish, SourceRef } from '../lib/types'

type LegacyRow = Record<string, any>

const asNumber = (value: unknown) => value === '' || value == null || Number.isNaN(Number(value)) ? undefined : Number(value)
const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function getLegacySource(): Promise<SourceRef> {
  try {
    const metadata = JSON.parse(await readFile(new URL('../data/raw/legacy/contestants.source.json', import.meta.url), 'utf8'))
    return {
      kind: 'wayback',
      title: 'בואו לאכול איתי — עונת הסטטיסטיקות (ארכיון)',
      author: 'nemo369',
      url: metadata.snapshotUrl,
      note: `Original API: ${metadata.originalUrl}; frontend: https://github.com/nemo369/dine-with-me`,
    }
  } catch {
    return {
      kind: 'legacy',
      title: 'בואו לאכול איתי — עונת הסטטיסטיקות',
      author: 'nemo369',
      url: 'https://github.com/nemo369/dine-with-me',
      note: 'Legacy structured data; original app credit preserved',
    }
  }
}

function evidenceFor(source: SourceRef, values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key]) => [key, [source]]),
  )
}

function splitDish(value: string, course: Dish['course'], source: SourceRef): Dish {
  const [name, ...description] = value.split(/\s+-\s+/)
  return {
    course,
    name: name.trim(),
    description: description.join(' - ').trim() || undefined,
    sources: [source],
  }
}

function legacyToContestant(row: LegacyRow, source: SourceRef): Contestant {
  const name = asString(row.name) ?? 'Unknown'
  const season = asNumber(row.session_number) ?? 0
  const week = row.week && typeof row.week === 'object' ? row.week : undefined

  const values = {
    name,
    season,
    weekName: asString(week?.description),
    hostingOrder: asNumber(row.order),
    age: asNumber(row.age),
    city: asString(row.city),
    occupation: asString(row.job),
    relationshipStatus: asString(row.family_status),
    gender: asString(row.gender),
    diet: asString(row.vegan),
    score: asNumber(row.score),
    placement: asNumber(row.final_place),
  }

  const dishRows = [
    ['first_course', 'starter'],
    ['main_course', 'main'],
    ['dessert', 'dessert'],
  ] as const
  const dishes = dishRows.flatMap(([key, course]) => {
    const value = asString(row[key])
    return value ? [splitDish(value, course, source)] : []
  })

  const placement = values.placement
  return {
    slug: `${season}-${slugify(name)}`,
    ...values,
    winner: placement === 1,
    dishes,
    episodeUrls: [],
    sources: [source],
    fieldSources: evidenceFor(source, { ...values, winner: placement === 1, dishes: dishes.length ? true : undefined }),
  }
}

async function main() {
  const input = new URL('../data/raw/legacy/contestants.json', import.meta.url)
  const output = new URL('../data/normalized/legacy-contestants.json', import.meta.url)
  const rows = JSON.parse(await readFile(input, 'utf8')) as LegacyRow[]
  const source = await getLegacySource()
  const normalized = rows.map((row) => legacyToContestant(row, source)).filter((row) => row.season > 0)
  await writeFile(output, JSON.stringify(normalized, null, 2))
  console.log(`Normalized ${normalized.length} legacy contestants with source attribution`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

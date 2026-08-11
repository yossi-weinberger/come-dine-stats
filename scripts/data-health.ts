import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Contestant } from '../lib/types'

const normalizedFile = new URL('../data/normalized/contestants.json', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)

type Finding = {
  code: string
  message: string
  context?: Record<string, unknown>
}

type CoverageReport = {
  overall?: {
    entries?: number
    winners?: number
    fieldCoverage?: Record<string, { count?: number; percent?: number }>
  }
}

type ConflictReport = Array<unknown>
type PlacementReport = {
  derivedEntries?: number
  skippedWeeks?: Array<{ season: number; week: number; reason: string }>
}

async function readJson<T>(url: URL, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(url, 'utf8')) as T
  } catch {
    return fallback
  }
}

function entityKey(entry: Contestant) {
  return `${entry.season}:${entry.name.normalize('NFKC').replace(/[\s'״׳".-]+/g, '').toLowerCase()}`
}

function weekKey(entry: Contestant) {
  return entry.week == null ? undefined : `${entry.season}:${entry.week}`
}

function isCompetitionActive(entry: Contestant) {
  return entry.status !== 'guest' && entry.status !== 'withdrawn' && entry.status !== 'disqualified'
}

async function main() {
  await mkdir(reportsDir, { recursive: true })

  const entries = await readJson<Contestant[]>(normalizedFile, [])
  const coverage = await readJson<CoverageReport>(new URL('coverage.json', reportsDir), {})
  const conflicts = await readJson<ConflictReport>(new URL('conflicts.json', reportsDir), [])
  const placements = await readJson<PlacementReport>(new URL('derived-placements.json', reportsDir), {})

  const errors: Finding[] = []
  const warnings: Finding[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const key = entityKey(entry)
    if (seen.has(key)) {
      errors.push({ code: 'duplicate-entry', message: `Duplicate normalized entry: ${entry.name}`, context: { key } })
    }
    seen.add(key)

    if (!entry.sources?.length) {
      errors.push({ code: 'source-less-entry', message: `Entry has no source: ${entry.name}`, context: { key } })
    }

    if (entry.score != null && (!Number.isFinite(entry.score) || entry.score < 0)) {
      errors.push({ code: 'invalid-score', message: `Invalid score for ${entry.name}`, context: { score: entry.score, key } })
    }

    if (entry.placement != null && (!Number.isInteger(entry.placement) || entry.placement < 1)) {
      errors.push({ code: 'invalid-placement', message: `Invalid placement for ${entry.name}`, context: { placement: entry.placement, key } })
    }

    if (entry.status === 'disqualified') {
      if (entry.placement != null) {
        errors.push({ code: 'disqualified-has-placement', message: `Disqualified entry still has a placement: ${entry.name}`, context: { placement: entry.placement, key } })
      }
      if (entry.winner) {
        errors.push({ code: 'disqualified-winner', message: `Disqualified entry cannot be a winner: ${entry.name}`, context: { key } })
      }
      const statusSources = entry.fieldSources?.status ?? []
      if (!statusSources.length) {
        errors.push({ code: 'disqualified-without-provenance', message: `Disqualification has no field provenance: ${entry.name}`, context: { key } })
      }
    }

    if (entry.winner && entry.placement != null && entry.placement !== 1) {
      errors.push({ code: 'winner-placement-mismatch', message: `Winner is not placed first: ${entry.name}`, context: { placement: entry.placement, key } })
    }

    const placementSources = entry.fieldSources?.placement ?? []
    const hasDerivedPlacement = placementSources.some((source) => source.kind === 'derived')
    if (hasDerivedPlacement && (entry.placement == null || entry.score == null || entry.week == null)) {
      errors.push({
        code: 'broken-derived-placement',
        message: `Derived placement is missing its required score/week/value: ${entry.name}`,
        context: { placement: entry.placement, score: entry.score, week: entry.week, key },
      })
    }
  }

  const weeks = new Map<string, Contestant[]>()
  for (const entry of entries) {
    const key = weekKey(entry)
    if (!key) continue
    weeks.set(key, [...(weeks.get(key) ?? []), entry])
  }

  for (const [key, group] of weeks) {
    const active = group.filter(isCompetitionActive)
    const hosting = active.filter((entry) => entry.hostingOrder != null)
    const duplicateOrders = [...new Set(hosting.map((entry) => entry.hostingOrder))]
      .filter((order) => hosting.filter((entry) => entry.hostingOrder === order).length > 1)
    if (duplicateOrders.length) {
      warnings.push({
        code: 'duplicate-hosting-order',
        message: `Week ${key} has duplicate hosting order values`,
        context: { orders: duplicateOrders, entries: hosting.map(({ name, hostingOrder }) => ({ name, hostingOrder })) },
      })
    }
  }

  const knownPlacementMismatches = placements.skippedWeeks?.filter((week) => week.reason === 'known-placement-mismatch') ?? []
  for (const week of knownPlacementMismatches) {
    warnings.push({
      code: 'placement-score-mismatch',
      message: `Sourced placement does not match raw score order in season ${week.season}, week ${week.week}`,
      context: week,
    })
  }

  if (conflicts.length) {
    warnings.push({ code: 'source-conflicts', message: `${conflicts.length} unresolved source conflicts remain`, context: { count: conflicts.length } })
  }

  const floors = [
    { label: 'entries', actual: coverage.overall?.entries ?? entries.length, minimum: 280 },
    { label: 'winners', actual: coverage.overall?.winners ?? entries.filter((entry) => entry.winner).length, minimum: 60 },
    { label: 'score', actual: coverage.overall?.fieldCoverage?.score?.count ?? entries.filter((entry) => entry.score != null).length, minimum: 250 },
    { label: 'hostingOrder', actual: coverage.overall?.fieldCoverage?.hostingOrder?.count ?? entries.filter((entry) => entry.hostingOrder != null).length, minimum: 280 },
  ]
  for (const floor of floors) {
    if (floor.actual < floor.minimum) {
      warnings.push({
        code: 'coverage-regression',
        message: `${floor.label} coverage fell below the safety floor`,
        context: { actual: floor.actual, minimum: floor.minimum },
      })
    }
  }

  const disqualified = entries.filter((entry) => entry.status === 'disqualified')
  const withdrawn = entries.filter((entry) => entry.status === 'withdrawn')
  const report = {
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    summary: {
      entries: entries.length,
      errors: errors.length,
      warnings: warnings.length,
      unresolvedConflicts: conflicts.length,
      derivedPlacements: placements.derivedEntries ?? 0,
      exceptionalStates: {
        disqualified: disqualified.length,
        withdrawn: withdrawn.length,
      },
    },
    errors,
    warnings,
  }

  await writeFile(new URL('data-health.json', reportsDir), JSON.stringify(report, null, 2))
  console.log(`Data health: ${report.status} — ${errors.length} errors, ${warnings.length} warnings`)
  if (disqualified.length) console.log(`Disqualified entries: ${disqualified.map((entry) => entry.name).join(', ')}`)

  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

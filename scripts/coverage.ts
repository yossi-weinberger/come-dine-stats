import { mkdir, writeFile } from 'node:fs/promises'
import contestantsJson from '../data/normalized/contestants.json'
import type { Contestant } from '../lib/types'

const contestants = contestantsJson as Contestant[]
const reportsDir = new URL('../data/reports/', import.meta.url)

const fields = [
  'weekName',
  'hostingOrder',
  'age',
  'city',
  'occupation',
  'relationshipStatus',
  'gender',
  'diet',
  'score',
  'placement',
] as const

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

function pct(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 10 : 0
}

function coverageFor(items: Contestant[]) {
  const fieldCoverage = Object.fromEntries(fields.map((field) => {
    const count = items.filter((item) => hasValue(item[field])).length
    return [field, {
      count,
      percent: pct(count, items.length),
      missing: items.filter((item) => !hasValue(item[field])).map((item) => item.name),
    }]
  }))

  const withAnyDish = items.filter((item) => item.dishes.length > 0).length
  const withThreePrimaryCourses = items.filter((item) => {
    const primary = new Set(item.dishes.filter((dish) => dish.course !== 'alternative').map((dish) => dish.course))
    return primary.has('starter') && primary.has('main') && primary.has('dessert')
  }).length

  return {
    contestants: items.length,
    dishes: items.reduce((sum, item) => sum + item.dishes.length, 0),
    winners: items.filter((item) => item.winner).length,
    fieldCoverage,
    menuCoverage: {
      anyDish: { count: withAnyDish, percent: pct(withAnyDish, items.length) },
      threePrimaryCourses: { count: withThreePrimaryCourses, percent: pct(withThreePrimaryCourses, items.length) },
    },
  }
}

async function main() {
  await mkdir(reportsDir, { recursive: true })

  const seasons = [...new Set(contestants.map((item) => item.season))].sort((a, b) => a - b)
  const sourceKinds = contestants.flatMap((item) => item.sources.map((source) => source.kind))
  const sourceCounts = Object.fromEntries([...new Set(sourceKinds)].sort().map((kind) => [
    kind,
    contestants.filter((item) => item.sources.some((source) => source.kind === kind)).length,
  ]))

  const report = {
    generatedAt: new Date().toISOString(),
    overall: coverageFor(contestants),
    bySeason: Object.fromEntries(seasons.map((season) => [String(season), coverageFor(contestants.filter((item) => item.season === season))])),
    sourceCounts,
  }

  await writeFile(new URL('coverage.json', reportsDir), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    contestants: report.overall.contestants,
    dishes: report.overall.dishes,
    seasons,
    menuCoverage: report.overall.menuCoverage,
    sourceCounts,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

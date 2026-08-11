import { mkdir, writeFile } from 'node:fs/promises'
import contestantsJson from '../data/normalized/contestants.json'
import type { Contestant, Dish } from '../lib/types'

const contestants = contestantsJson as unknown as Contestant[]
const reportsDir = new URL('../data/reports/', import.meta.url)
const primaryCourses = ['starter', 'main', 'dessert'] as const

type PrimaryCourse = typeof primaryCourses[number]
type GapStatus = 'none' | 'partial' | 'one-course-away' | 'complete'

function variantOf(dish: Dish) {
  return dish.variant ?? 'standard'
}

function primaryCourseSet(entry: Contestant) {
  return new Set(
    entry.dishes
      .filter((dish) => variantOf(dish) === 'standard' && primaryCourses.includes(dish.course as PrimaryCourse))
      .map((dish) => dish.course as PrimaryCourse),
  )
}

function gapStatus(entry: Contestant): GapStatus {
  const primary = primaryCourseSet(entry)
  if (primary.size === 3) return 'complete'
  if (primary.size === 2) return 'one-course-away'
  if (entry.dishes.length > 0) return 'partial'
  return 'none'
}

function priority(status: GapStatus) {
  switch (status) {
    case 'one-course-away': return 100
    case 'partial': return 70
    case 'none': return 50
    case 'complete': return 0
  }
}

function sourceKinds(entry: Contestant) {
  return [...new Set(entry.dishes.flatMap((dish) => dish.sources ?? []).map((source) => source.kind))].sort()
}

async function main() {
  await mkdir(reportsDir, { recursive: true })

  const rows = contestants.map((entry) => {
    const primary = primaryCourseSet(entry)
    const status = gapStatus(entry)
    return {
      season: entry.season,
      week: entry.week,
      weekName: entry.weekName,
      name: entry.name,
      slug: entry.slug,
      status,
      priority: priority(status),
      dishCount: entry.dishes.length,
      primaryCoursesPresent: primaryCourses.filter((course) => primary.has(course)),
      missingPrimaryCourses: primaryCourses.filter((course) => !primary.has(course)),
      dishSourceKinds: sourceKinds(entry),
      dishes: entry.dishes.map((dish) => ({
        course: dish.course,
        variant: variantOf(dish),
        name: dish.name,
        sources: (dish.sources ?? []).map((source) => ({ kind: source.kind, url: source.url })),
      })),
    }
  })

  const queue = rows
    .filter((row) => row.status !== 'complete')
    .sort((a, b) => b.priority - a.priority || a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || a.name.localeCompare(b.name, 'he'))

  const seasons = [...new Set(rows.map((row) => row.season))].sort((a, b) => a - b)
  const counts = Object.fromEntries((['none', 'partial', 'one-course-away', 'complete'] as GapStatus[]).map((status) => [
    status,
    rows.filter((row) => row.status === status).length,
  ]))

  const report = {
    rule: 'A complete menu requires standard starter + main + dessert. Named dishes without a supported course remain partial evidence and never fill a primary-course gap by inference.',
    summary: {
      entries: rows.length,
      ...counts,
      researchQueue: queue.length,
      targetAnyDish50Percent: Math.ceil(rows.length * 0.5),
      additionalEntriesNeededFor50PercentAnyDish: Math.max(0, Math.ceil(rows.length * 0.5) - rows.filter((row) => row.dishCount > 0).length),
    },
    bySeason: Object.fromEntries(seasons.map((season) => {
      const seasonRows = rows.filter((row) => row.season === season)
      return [String(season), {
        entries: seasonRows.length,
        anyDish: seasonRows.filter((row) => row.dishCount > 0).length,
        complete: seasonRows.filter((row) => row.status === 'complete').length,
        oneCourseAway: seasonRows.filter((row) => row.status === 'one-course-away').length,
        partial: seasonRows.filter((row) => row.status === 'partial').length,
        none: seasonRows.filter((row) => row.status === 'none').length,
      }]
    })),
    leadCatalog: [
      {
        id: 'kan-archive',
        scope: 'seasons 5–10',
        role: 'Official episode/archive descriptions; useful when a dish or menu is explicitly named.',
        caution: 'Do not infer courses or full menus from cuisine/meal-style descriptions.',
      },
      {
        id: 'rest-recaps',
        scope: 'especially seasons 6–8',
        role: 'Editorial episode/week recaps that sometimes name individual dishes or full menus.',
        caution: 'Many recaps mention selected dishes only; preserve them as partial evidence.',
      },
      {
        id: 'foodik-first-person',
        scope: 'contestant-specific',
        role: 'First-person contestant accounts can explicitly name served dishes.',
        caution: 'Require clear identification of the show meal and preserve the article URL.',
      },
      {
        id: 'wayback-recipe-recovery',
        scope: 'historical seasons',
        role: 'Recover disappeared official/editorial recipe and episode pages.',
        caution: 'Archive snapshots are leads until the contestant and served dish are explicit.',
      },
    ],
    queue,
  }

  await writeFile(new URL('menu-gaps.json', reportsDir), JSON.stringify(report, null, 2))
  console.log(`Menu gaps: ${counts.complete} complete, ${counts['one-course-away']} one course away, ${counts.partial} partial, ${counts.none} with no dishes`)
  console.log(`Need ${report.summary.additionalEntriesNeededFor50PercentAnyDish} more entries with a sourced dish to reach 50% any-dish coverage`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

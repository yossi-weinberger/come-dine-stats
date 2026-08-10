import { mkdir, writeFile } from 'node:fs/promises'
import contestantsJson from '../data/normalized/contestants.json'
import type { Contestant, Dish } from '../lib/types'

const contestants = contestantsJson as unknown as Contestant[]
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

function participantCount(item: Contestant) {
  return item.members?.length || 1
}

function variantOf(dish: Dish) {
  return dish.variant ?? 'standard'
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

  const allDishes = items.flatMap((item) => item.dishes)
  const withAnyDish = items.filter((item) => item.dishes.length > 0).length
  const withThreePrimaryCourses = items.filter((item) => {
    const primary = new Set(
      item.dishes
        .filter((dish) => variantOf(dish) === 'standard')
        .map((dish) => dish.course),
    )
    return primary.has('starter') && primary.has('main') && primary.has('dessert')
  }).length
  const withVegetarianAlternative = items.filter((item) => item.dishes.some((dish) => variantOf(dish) === 'vegetarian')).length
  const withVeganAlternative = items.filter((item) => item.dishes.some((dish) => variantOf(dish) === 'vegan')).length

  const dishCountsByCourse = Object.fromEntries(['starter', 'main', 'dessert'].map((course) => [
    course,
    allDishes.filter((dish) => dish.course === course).length,
  ]))
  const dishCountsByVariant = Object.fromEntries(['standard', 'vegetarian', 'vegan', 'alternative'].map((variant) => [
    variant,
    allDishes.filter((dish) => variantOf(dish) === variant).length,
  ]))

  return {
    entries: items.length,
    participants: items.reduce((sum, item) => sum + participantCount(item), 0),
    individualEntries: items.filter((item) => item.entryType !== 'couple').length,
    coupleEntries: items.filter((item) => item.entryType === 'couple').length,
    withdrawnEntries: items.filter((item) => item.status === 'withdrawn').length,
    dishes: allDishes.length,
    winners: items.filter((item) => item.winner).length,
    fieldCoverage,
    menuCoverage: {
      anyDish: { count: withAnyDish, percent: pct(withAnyDish, items.length) },
      threePrimaryCourses: { count: withThreePrimaryCourses, percent: pct(withThreePrimaryCourses, items.length) },
      vegetarianAlternative: { count: withVegetarianAlternative, percent: pct(withVegetarianAlternative, items.length) },
      veganAlternative: { count: withVeganAlternative, percent: pct(withVeganAlternative, items.length) },
      dishesByCourse: dishCountsByCourse,
      dishesByVariant: dishCountsByVariant,
      missingThreePrimaryCourses: items
        .filter((item) => {
          const primary = new Set(item.dishes.filter((dish) => variantOf(dish) === 'standard').map((dish) => dish.course))
          return !(primary.has('starter') && primary.has('main') && primary.has('dessert'))
        })
        .map((item) => item.name),
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
    overall: coverageFor(contestants),
    bySeason: Object.fromEntries(seasons.map((season) => [String(season), coverageFor(contestants.filter((item) => item.season === season))])),
    sourceCounts,
  }

  await writeFile(new URL('coverage.json', reportsDir), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    entries: report.overall.entries,
    participants: report.overall.participants,
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

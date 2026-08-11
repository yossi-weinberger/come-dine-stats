import { readFile, writeFile } from 'node:fs/promises'
import type { Contestant } from '../lib/types'

type CoverageField = { count: number; percent: number }
type CoverageReport = {
  overall: {
    entries: number
    participants: number
    individualEntries: number
    coupleEntries: number
    withdrawnEntries: number
    dishes: number
    winners: number
    fieldCoverage: {
      weekName: CoverageField
      hostingOrder: CoverageField
      age: CoverageField
      city: CoverageField
      occupation: CoverageField
    }
  }
}

const contestantsFile = new URL('../data/normalized/contestants.json', import.meta.url)
const coverageFile = new URL('../data/reports/coverage.json', import.meta.url)
const readmeFile = new URL('../README.md', import.meta.url)

const startMarker = '<!-- DATA_SNAPSHOT_START -->'
const endMarker = '<!-- DATA_SNAPSHOT_END -->'

function percent(field: CoverageField) {
  return `${field.count}/${coverage.overall.entries} (${field.percent}%)`
}

const contestants = JSON.parse(await readFile(contestantsFile, 'utf8')) as Contestant[]
const coverage = JSON.parse(await readFile(coverageFile, 'utf8')) as CoverageReport
const readme = await readFile(readmeFile, 'utf8')

const ages = contestants.flatMap((contestant) => contestant.age ? [contestant.age] : [])
const scores = contestants.flatMap((contestant) => contestant.score != null ? [contestant.score] : [])
const averageAge = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : null
const topScore = scores.length ? Math.max(...scores) : null
const seasons = new Set(contestants.map((contestant) => contestant.season)).size

const snapshot = [
  startMarker,
  '## מצב הדאטה',
  '',
  '> הקטע הזה נוצר אוטומטית מהמאגר בכל רענון. מקור האמת המלא לכיסוי הוא `data/reports/coverage.json`.',
  '',
  `- **${coverage.overall.entries}** רשומות תחרות, המייצגות **${coverage.overall.participants}** משתתפים (${coverage.overall.coupleEntries} רשומות זוגיות).`,
  `- **${seasons} עונות** מיוצגות במאגר.`,
  `- **${coverage.overall.dishes} מנות** ו-**${coverage.overall.winners} מנצחים** מתועדים כרגע.`,
  `- סדר אירוח: **${percent(coverage.overall.fieldCoverage.hostingOrder)}**; שם שבוע/אזור: **${percent(coverage.overall.fieldCoverage.weekName)}**.`,
  `- עיר: **${percent(coverage.overall.fieldCoverage.city)}**; גיל: **${percent(coverage.overall.fieldCoverage.age)}**; מקצוע: **${percent(coverage.overall.fieldCoverage.occupation)}**.`,
  `- גיל ממוצע מתוך הרשומות שבהן גיל ידוע: **${averageAge ?? 'לא זמין'}**; ציון השיא המתועד: **${topScore ?? 'לא זמין'}**.`,
  endMarker,
].join('\n')

if (!readme.includes(startMarker) || !readme.includes(endMarker)) {
  throw new Error('README data snapshot markers are missing')
}

const before = readme.slice(0, readme.indexOf(startMarker))
const after = readme.slice(readme.indexOf(endMarker) + endMarker.length)
const nextReadme = `${before}${snapshot}${after}`

if (nextReadme !== readme) {
  await writeFile(readmeFile, nextReadme)
  console.log('Updated README data snapshot')
} else {
  console.log('README data snapshot already current')
}

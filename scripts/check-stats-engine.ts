import contestantsJson from '../data/normalized/contestants.json'
import { buildSeasonStats, buildWeekRecords, buildWinnerMargins, groupCompetitionWeeks, mean, median } from '../lib/stats-engine'
import type { Contestant } from '../lib/types'

const entries = contestantsJson as unknown as Contestant[]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(mean([]) === null, 'mean([]) should be null')
assert(mean([1, 2, 3]) === 2, 'mean helper regression')
assert(median([3, 1, 2]) === 2, 'odd median regression')
assert(median([1, 2, 3, 4]) === 2.5, 'even median regression')

const weeks = groupCompetitionWeeks(entries)
const disqualificationWeek = weeks.find((week) => week.season === 2 && week.week === 7)
assert(disqualificationWeek, 'Expected season 2 week 7')
assert(disqualificationWeek.hasDisqualification, 'Season 2 week 7 must remain marked as a disqualification week')
assert(!disqualificationWeek.scoreOrderEligible, 'Disqualification week must never be eligible for score-order analytics')

const margins = buildWinnerMargins(entries)
assert(!margins.some((margin) => margin.season === 2 && margin.week === 7), 'Disqualification week leaked into winner-margin analytics')

const seasonStats = buildSeasonStats(entries)
assert(seasonStats.length === new Set(entries.map((entry) => entry.season)).size, 'Season stats lost a season')
assert(seasonStats.every((season) => season.scoredEntries <= season.activeEntries), 'Season scored n cannot exceed active entries')
assert(seasonStats.every((season) => season.scoreCoveragePercent >= 0 && season.scoreCoveragePercent <= 100), 'Invalid score coverage percentage')

const records = buildWeekRecords(entries)
assert(records.eligibleWeeks > 0, 'Expected at least one complete ordinary week for records')
for (const record of [records.highestMean, records.lowestMean, records.widestSpread, records.tightestSpread]) {
  assert(!record || !record.hasDisqualification, 'Exceptional week leaked into week records')
}

console.log(JSON.stringify({
  ok: true,
  seasons: seasonStats.length,
  weeks: weeks.length,
  winnerMargins: margins.length,
  eligibleWeekRecords: records.eligibleWeeks,
}, null, 2))

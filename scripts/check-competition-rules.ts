import assert from 'node:assert/strict'
import contestantsJson from '../data/normalized/contestants.json'
import placementReportJson from '../data/reports/derived-placements.json'
import { isCompetitionActive, scoreEntries } from '../lib/competition'
import type { Contestant } from '../lib/types'

const contestants = contestantsJson as unknown as Contestant[]
const placementReport = placementReportJson as {
  skippedWeeks: Array<{ season: number; week: number; reason: string }>
}

const benjamin = contestants.find((entry) => entry.season === 2 && entry.name === 'בנימין יעקביאן')
assert.ok(benjamin, 'Expected Benjamin Yaakobian in normalized dataset')
assert.equal(benjamin.status, 'disqualified', 'Benjamin must stay explicitly disqualified')
assert.equal(benjamin.placement, undefined, 'Disqualified entry must not receive a placement')
assert.equal(benjamin.winner, false, 'Disqualified entry cannot be a winner')
assert.equal(isCompetitionActive(benjamin), false, 'Disqualified entry must be excluded from competitive analytics')

const jerusalemWeek = placementReport.skippedWeeks.find((week) => week.season === 2 && week.week === 7)
assert.equal(jerusalemWeek?.reason, 'exceptional-week', 'Season 2 week 7 must remain an exceptional week')

const knownTie = placementReport.skippedWeeks.find((week) => week.season === 1 && week.week === 3)
assert.equal(knownTie?.reason, 'score-tie', 'Known tied week must remain tie-aware')

const synthetic: Contestant[] = [
  { slug: 'active', name: 'Active', season: 1, score: 30, dishes: [], sources: [] },
  { slug: 'withdrawn', name: 'Withdrawn', season: 1, status: 'withdrawn', score: 40, dishes: [], sources: [] },
  { slug: 'guest', name: 'Guest', season: 1, status: 'guest', score: 50, dishes: [], sources: [] },
  { slug: 'dq', name: 'DQ', season: 1, status: 'disqualified', score: 0, dishes: [], sources: [] },
]
assert.deepEqual(scoreEntries(synthetic).map((entry) => entry.name), ['Active'])

console.log('Competition rules: pass')

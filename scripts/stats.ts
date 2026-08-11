import contestantsJson from '../data/normalized/contestants.json'
import { competitionEntries, knownScores } from '../lib/competition'
import type { Contestant } from '../lib/types'

const entries = contestantsJson as unknown as Contestant[]
const competitiveEntries = competitionEntries(entries)
const winners = competitiveEntries.filter((c) => c.winner)
const ages = entries.flatMap((c) => c.age ? [c.age] : [])
const scores = knownScores(entries)
const participants = entries.reduce((sum, entry) => sum + (entry.members?.length || 1), 0)

console.table({
  participants,
  competitionEntries: entries.length,
  activeCompetitionEntries: competitiveEntries.length,
  coupleEntries: entries.filter((entry) => entry.entryType === 'couple').length,
  disqualifiedEntries: entries.filter((entry) => entry.status === 'disqualified').length,
  seasons: new Set(entries.map((c) => c.season)).size,
  winners: winners.length,
  dishes: entries.reduce((n, c) => n + c.dishes.length, 0),
  averageAge: ages.length ? Math.round(ages.reduce((a,b) => a+b,0) / ages.length) : null,
  topScore: scores.length ? Math.max(...scores) : null,
})

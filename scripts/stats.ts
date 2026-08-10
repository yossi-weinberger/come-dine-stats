import contestantsJson from '../data/normalized/contestants.json'
import type { Contestant } from '../lib/types'

const contestants = contestantsJson as Contestant[]
const winners = contestants.filter((c) => c.winner)
const ages = contestants.flatMap((c) => c.age ? [c.age] : [])
const scores = contestants.flatMap((c) => c.score != null ? [c.score] : [])

console.table({
  contestants: contestants.length,
  seasons: new Set(contestants.map((c) => c.season)).size,
  winners: winners.length,
  dishes: contestants.reduce((n, c) => n + c.dishes.length, 0),
  averageAge: ages.length ? Math.round(ages.reduce((a,b) => a+b,0) / ages.length) : null,
  topScore: scores.length ? Math.max(...scores) : null,
})

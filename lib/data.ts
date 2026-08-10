import contestantsJson from '@/data/normalized/contestants.json'
import type { Contestant } from './types'

export const contestants = contestantsJson as Contestant[]

export function getStats(items = contestants) {
  const withAge = items.filter((c) => typeof c.age === 'number')
  const winners = items.filter((c) => c.winner)
  const withScore = items.filter((c) => typeof c.score === 'number')

  return {
    contestants: items.length,
    seasons: new Set(items.map((c) => c.season)).size,
    winners: winners.length,
    averageAge: withAge.length
      ? Math.round(withAge.reduce((sum, c) => sum + (c.age ?? 0), 0) / withAge.length)
      : null,
    averageWinnerAge: winners.filter((c) => c.age).length
      ? Math.round(
          winners.reduce((sum, c) => sum + (c.age ?? 0), 0) /
            winners.filter((c) => c.age).length,
        )
      : null,
    topScore: withScore.length ? Math.max(...withScore.map((c) => c.score ?? 0)) : null,
    dishes: items.reduce((sum, c) => sum + c.dishes.length, 0),
    sources: new Set(items.flatMap((c) => c.sources.map((source) => `${source.kind}:${source.url}`))).size,
  }
}

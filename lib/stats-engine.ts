import { competitionEntries, scoreEntries } from './competition'
import type { Contestant } from './types'

export type CompetitionWeekStats = {
  season: number
  week: number
  weekName?: string
  entries: Contestant[]
  activeEntries: Contestant[]
  scoredEntries: Contestant[]
  scoreCount: number
  activeCount: number
  hasDisqualification: boolean
  scoresComplete: boolean
  scoreOrderEligible: boolean
  meanScore: number | null
  medianScore: number | null
  minScore: number | null
  maxScore: number | null
  spread: number | null
  scoreTie: boolean
  winners: Contestant[]
}

export type SeasonStats = {
  season: number
  entries: number
  activeEntries: number
  participants: number
  scoredEntries: number
  scoreCoveragePercent: number
  meanScore: number | null
  medianScore: number | null
  minScore: number | null
  maxScore: number | null
  spread: number | null
  winners: number
  weeks: number
  completeScoreWeeks: number
  scoreTieWeeks: number
  dishes: number
}

export type HostingOrderStats = {
  order: number
  entries: number
  scoredEntries: number
  meanScore: number | null
  winners: number
  winRatePercent: number
}

export type WinnerMargin = {
  season: number
  week: number
  weekName?: string
  winner: Contestant
  runnerUp: Contestant
  margin: number
  scoredEntries: number
  activeEntries: number
}

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

export function mean(values: number[]) {
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

export function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[middle]
  return round1((sorted[middle - 1] + sorted[middle]) / 2)
}

export function percent(count: number, total: number) {
  return total ? round1((count / total) * 100) : 0
}

function scoreValues(entries: Contestant[]) {
  return scoreEntries(entries).map((entry) => entry.score as number)
}

function scoreRange(scores: number[]) {
  if (!scores.length) return { minScore: null, maxScore: null, spread: null }
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  return { minScore, maxScore, spread: maxScore - minScore }
}

function participantCount(entry: Contestant) {
  return entry.members?.length || 1
}

export function groupCompetitionWeeks(entries: Contestant[]): CompetitionWeekStats[] {
  const groups = new Map<string, Contestant[]>()
  for (const entry of entries) {
    if (entry.week == null) continue
    const key = `${entry.season}:${entry.week}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  return [...groups.values()]
    .map((group) => {
      const activeEntries = competitionEntries(group)
      const scoredEntries = scoreEntries(group)
      const scores = scoredEntries.map((entry) => entry.score as number)
      const range = scoreRange(scores)
      const hasDisqualification = group.some((entry) => entry.status === 'disqualified')
      const scoresComplete = activeEntries.length >= 2 && scoredEntries.length === activeEntries.length
      return {
        season: group[0].season,
        week: group[0].week as number,
        weekName: group.find((entry) => entry.weekName)?.weekName,
        entries: group,
        activeEntries,
        scoredEntries,
        scoreCount: scoredEntries.length,
        activeCount: activeEntries.length,
        hasDisqualification,
        scoresComplete,
        scoreOrderEligible: scoresComplete && !hasDisqualification,
        meanScore: mean(scores),
        medianScore: median(scores),
        ...range,
        scoreTie: new Set(scores).size < scores.length,
        winners: activeEntries.filter((entry) => entry.winner),
      }
    })
    .sort((a, b) => a.season - b.season || a.week - b.week)
}

export function buildSeasonStats(entries: Contestant[]): SeasonStats[] {
  const seasons = [...new Set(entries.map((entry) => entry.season))].sort((a, b) => a - b)
  const weeks = groupCompetitionWeeks(entries)

  return seasons.map((season) => {
    const seasonEntries = entries.filter((entry) => entry.season === season)
    const active = competitionEntries(seasonEntries)
    const scores = scoreValues(seasonEntries)
    const seasonWeeks = weeks.filter((week) => week.season === season)
    const range = scoreRange(scores)
    return {
      season,
      entries: seasonEntries.length,
      activeEntries: active.length,
      participants: seasonEntries.reduce((sum, entry) => sum + participantCount(entry), 0),
      scoredEntries: scores.length,
      scoreCoveragePercent: percent(scores.length, active.length),
      meanScore: mean(scores),
      medianScore: median(scores),
      ...range,
      winners: active.filter((entry) => entry.winner).length,
      weeks: seasonWeeks.length,
      completeScoreWeeks: seasonWeeks.filter((week) => week.scoreOrderEligible).length,
      scoreTieWeeks: seasonWeeks.filter((week) => week.scoreOrderEligible && week.scoreTie).length,
      dishes: seasonEntries.reduce((sum, entry) => sum + entry.dishes.length, 0),
    }
  })
}

export function buildHostingOrderStats(entries: Contestant[], orders = [1, 2, 3, 4, 5]): HostingOrderStats[] {
  const active = competitionEntries(entries)
  return orders.map((order) => {
    const orderEntries = active.filter((entry) => entry.hostingOrder === order)
    const scored = scoreEntries(orderEntries)
    const winners = orderEntries.filter((entry) => entry.winner)
    return {
      order,
      entries: orderEntries.length,
      scoredEntries: scored.length,
      meanScore: mean(scored.map((entry) => entry.score as number)),
      winners: winners.length,
      winRatePercent: percent(winners.length, orderEntries.length),
    }
  })
}

export function buildWinnerMargins(entries: Contestant[]): WinnerMargin[] {
  const margins: WinnerMargin[] = []
  for (const week of groupCompetitionWeeks(entries)) {
    if (week.hasDisqualification) continue
    const winners = week.activeEntries.filter((entry) => entry.winner && typeof entry.score === 'number')
    const others = week.activeEntries
      .filter((entry) => !entry.winner && typeof entry.score === 'number')
      .sort((a, b) => (b.score as number) - (a.score as number))
    if (winners.length !== 1 || !others.length) continue

    const winner = winners[0]
    const runnerUp = others[0]
    const margin = (winner.score as number) - (runnerUp.score as number)
    if (margin < 0) continue
    margins.push({
      season: week.season,
      week: week.week,
      weekName: week.weekName,
      winner,
      runnerUp,
      margin,
      scoredEntries: week.scoreCount,
      activeEntries: week.activeCount,
    })
  }
  return margins
}

export function completeScoreWeeks(entries: Contestant[]) {
  return groupCompetitionWeeks(entries).filter((week) => week.scoreOrderEligible)
}

export function buildWeekRecords(entries: Contestant[]) {
  const weeks = completeScoreWeeks(entries)
  const byMeanDesc = [...weeks].filter((week) => week.meanScore != null).sort((a, b) => (b.meanScore as number) - (a.meanScore as number))
  const bySpreadDesc = [...weeks].filter((week) => week.spread != null).sort((a, b) => (b.spread as number) - (a.spread as number))
  const bySpreadAsc = [...weeks].filter((week) => week.spread != null).sort((a, b) => (a.spread as number) - (b.spread as number))

  return {
    eligibleWeeks: weeks.length,
    highestMean: byMeanDesc[0] ?? null,
    lowestMean: byMeanDesc.at(-1) ?? null,
    widestSpread: bySpreadDesc[0] ?? null,
    tightestSpread: bySpreadAsc[0] ?? null,
  }
}

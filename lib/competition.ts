import type { Contestant } from './types'

const nonCompetitiveStatuses = new Set<NonNullable<Contestant['status']>>([
  'guest',
  'withdrawn',
  'disqualified',
])

export function isCompetitionActive(entry: Contestant) {
  return !entry.status || !nonCompetitiveStatuses.has(entry.status)
}

export function competitionEntries(entries: Contestant[]) {
  return entries.filter(isCompetitionActive)
}

export function scoreEntries(entries: Contestant[]) {
  return entries.filter((entry) => isCompetitionActive(entry) && typeof entry.score === 'number')
}

export function knownScores(entries: Contestant[]) {
  return scoreEntries(entries).map((entry) => entry.score as number)
}

export function competitionStatusLabel(entry: Contestant) {
  switch (entry.status) {
    case 'disqualified': return 'נפסל/ה מהתחרות'
    case 'withdrawn': return 'פרש/ה מהתחרות'
    case 'guest': return 'אורח/ת'
    default: return undefined
  }
}

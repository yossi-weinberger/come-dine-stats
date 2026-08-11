import { readFile, writeFile } from 'node:fs/promises'
import type { Contestant, Episode, SourceRef } from '../lib/types'

type Diagnostic = {
  season: number
  name: string
  episode?: number
  city?: string
  text: string
}

const kanContestantsFile = new URL('../data/normalized/kan-contestants.json', import.meta.url)
const kanEpisodesFile = new URL('../data/normalized/kan-episodes.json', import.meta.url)
const wikipediaFile = new URL('../data/normalized/wikipedia-contestants.json', import.meta.url)
const reportFile = new URL('../data/reports/kan-city-enrichment.json', import.meta.url)

const cityCues: Array<{ city: string; pattern: RegExp }> = [
  { city: 'נווה דניאל', pattern: /(?:מ|ב)נווה דניאל/u },
  { city: 'גבעתיים', pattern: /(?:מ|ב)גבעתיים/u },
  { city: 'תל אביב', pattern: /(?:מ|ב)(?:דרום |צפון )?תל אביב/u },
  { city: 'באר שבע', pattern: /(?:מ|ב)באר שבע|בב["״]ש|מב["״]ש/u },
  { city: 'אשקלון', pattern: /(?:מ|ב)אשקלון/u },
  { city: 'ירוחם', pattern: /(?:מ|ב)ירוחם/u },
  { city: 'בני ברק', pattern: /(?:מ|ב)בני ברק/u },
  { city: 'דלית אל-כרמל', pattern: /(?:מ|ב)דלית אל[- ]כרמל/u },
  { city: 'קריית אתא', pattern: /(?:מ|ב)קרי(?:י)?ת אתא/u },
  { city: 'נשר', pattern: /(?:מ|ב)נשר/u },
  { city: 'חדרה', pattern: /(?:מ|ב)חדרה/u },
  { city: 'פתח תקווה', pattern: /(?:מ|ב)פתח תקווה/u },
  { city: 'נתניה', pattern: /(?:מ|ב)נתניה/u },
  { city: 'יקנעם', pattern: /(?:מ|ב)יקנעם/u },
  { city: 'חיפה', pattern: /(?:מ|ב)חיפה/u },
  { city: 'מגדל', pattern: /(?:מהמושבה |מ|ב)מגדל/u },
  { city: 'נטף', pattern: /(?:מ|ב)נטף/u },
  { city: 'כליל', pattern: /(?:מ|ב)כליל/u },
  { city: 'עפולה', pattern: /(?:מ|ב)עפולה/u },
  { city: 'חצור הגלילית', pattern: /(?:מ|ב)חצור הגלילית/u },
  { city: 'עין יעקב', pattern: /(?:מ|ב)עין יעקב/u },
]

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalize(value: string) {
  return compact(value)
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .replace(/["'״׳().,;:–—-]/g, '')
    .replace(/\s+/g, '')
}

function entityKey(entry: Pick<Contestant, 'season' | 'name'>) {
  return `${entry.season}:${normalize(entry.name)}`
}

function rawNameCandidates(name: string) {
  const clean = compact(name)
  const tokens = clean.replace(/\([^)]*\)/g, '').split(/\s+/).filter(Boolean)
  const aliases = [...clean.matchAll(/\(([^)]+)\)/g)].map((match) => match[1])
  return [...new Set([tokens[0], tokens.at(-1), ...aliases].filter((value): value is string => Boolean(value)))]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hostLocalContext(name: string, episodeText: string) {
  const clean = compact(episodeText)
  for (const candidate of rawNameCandidates(name)) {
    if (candidate.length < 2) continue
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(?:[לבמוכהו])?${escapeRegExp(candidate)}(?=$|[^\\p{L}\\p{N}])`, 'u')
    const match = pattern.exec(clean)
    if (!match) continue
    const start = Math.max(0, match.index + match[1].length - 45)
    const end = Math.min(clean.length, match.index + match[0].length + 140)
    return clean.slice(start, end)
  }
  return ''
}

function inferCity(name: string, episodeText: string) {
  const context = hostLocalContext(name, episodeText)
  if (!context) return undefined
  for (const cue of cityCues) {
    if (cue.pattern.test(context)) return cue.city
  }
  return undefined
}

function uniqSources(sources: SourceRef[]) {
  return [...new Map(sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
}

async function main() {
  const kanContestants = JSON.parse(await readFile(kanContestantsFile, 'utf8')) as Contestant[]
  const episodes = JSON.parse(await readFile(kanEpisodesFile, 'utf8')) as Episode[]
  const wikipediaContestants = JSON.parse(await readFile(wikipediaFile, 'utf8')) as Contestant[]
  const wikipediaByKey = new Map(wikipediaContestants.map((entry) => [entityKey(entry), entry]))
  const episodeByUrl = new Map(episodes.map((episode) => [episode.url, episode]))
  const diagnostics: Diagnostic[] = []

  const output = kanContestants.map((entry) => {
    const wikipediaEntry = wikipediaByKey.get(entityKey(entry))
    if (wikipediaEntry?.city || entry.city) return entry

    const episode = entry.episodeUrls?.map((url) => episodeByUrl.get(url)).find(Boolean)
    if (!episode) return entry

    const text = `${episode.title} ${episode.description ?? ''}`
    const city = inferCity(entry.name, text)
    diagnostics.push({
      season: entry.season,
      name: entry.name,
      episode: episode.episode,
      city,
      text: compact(text).slice(0, 300),
    })
    if (!city) return entry

    const source: SourceRef = {
      ...episode.source,
      url: episode.url,
      note: `Official Kan episode ${episode.episode}; city extracted from an explicit host-local location phrase`,
    }

    return {
      ...entry,
      city,
      sources: uniqSources([...entry.sources, source]),
      fieldSources: {
        ...(entry.fieldSources ?? {}),
        city: uniqSources([...(entry.fieldSources?.city ?? []), source]),
      },
    }
  })

  await writeFile(kanContestantsFile, JSON.stringify(output, null, 2))
  await writeFile(reportFile, JSON.stringify({
    considered: diagnostics.length,
    enriched: diagnostics.filter((item) => item.city).length,
    policy: 'Only fill a city when Wikipedia has no city and the matched Kan episode contains an explicit host-local place phrase.',
    diagnostics,
  }, null, 2))

  console.log(`Kan city enrichment: ${diagnostics.filter((item) => item.city).length}/${diagnostics.length} missing cities filled`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

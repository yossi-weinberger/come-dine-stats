import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, Episode, SourceRef } from '../lib/types'

type SeasonPage = { season: number; url: string }
type MatchMethod = 'hosting-order' | 'explicit-host-text'
type EnrichmentDiagnostic = {
  season: number
  episode: number
  week?: number
  hostingOrder?: number
  matched?: string
  matchMethod?: MatchMethod
  candidates?: string[]
  text: string
}

const configUrl = new URL('../data/kan-season-pages.json', import.meta.url)
const rawDir = new URL('../data/raw/kan/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const normalizedFile = new URL('../data/normalized/kan-episodes.json', import.meta.url)
const contestantsFile = new URL('../data/normalized/kan-contestants.json', import.meta.url)
const enrichmentReportFile = new URL('../data/reports/kan-contestant-enrichment.json', import.meta.url)
const wikipediaFile = new URL('../data/normalized/wikipedia-contestants.json', import.meta.url)

const dayOrder: Record<string, number> = { "א'": 1, "ב'": 2, "ג'": 3, "ד'": 4, "ה'": 5 }

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

function words(value: string) {
  return compact(value)
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .replace(/["'״׳]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstNameCandidates(name: string) {
  const clean = compact(name)
  const firstToken = clean.split(/\s+/)[0]
  const aliases = [...clean.matchAll(/\(([^)]+)\)/g)].map((match) => match[1])
  return [...new Set([firstToken, ...aliases].map(normalize).filter(Boolean))]
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'come-dine-stats/0.5 (metadata importer; official source links preserved)',
    },
  })
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString() } catch { return base }
}

function inferredHostingOrder(season: number, episode: number | undefined) {
  if (!episode || season < 5 || season > 9) return undefined
  return ((episode - 1) % 5) + 1
}

function parseEpisodeLabel(text: string, fallbackSeason: number) {
  const clean = compact(text).replace(/^\d{2}:\d{2}:\d{2}\s*/, '')
  const season = Number(clean.match(/עונה\s*(\d+)/)?.[1] ?? fallbackSeason)
  const episode = Number(clean.match(/פרק\s*(\d+)/)?.[1])
  const explicitWeek = clean.match(/שבוע\s+([^,|–—-]+?)(?=,\s*יום|\s*[|–—-])/u)?.[1]?.trim()
  const prefixWeek = clean.match(/^(.+?)\s*[-–—]\s*יום\s+[אבגדה]'?/u)?.[1]?.trim()
  const weekName = explicitWeek ?? prefixWeek
  const day = clean.match(/יום\s+([אבגדה]'?)/u)?.[1]
  return {
    season,
    episode: Number.isFinite(episode) && episode > 0 ? episode : undefined,
    weekName,
    hostingOrder: day
      ? dayOrder[day.includes("'") ? day : `${day}'`]
      : inferredHostingOrder(season, Number.isFinite(episode) ? episode : undefined),
    clean,
  }
}

function extractEpisodes(html: string, page: SeasonPage): Episode[] {
  const $ = cheerio.load(html)
  const source: SourceRef = {
    kind: 'kan',
    title: 'כאן 11 — בואו לאכול איתי',
    url: page.url,
    note: 'Official episode archive; factual metadata and links only',
  }
  const episodes: Episode[] = []
  const seen = new Set<string>()

  $('a').each((_, element) => {
    const anchor = $(element)
    const text = compact(anchor.text())
    if (!/פרק\s*\d+/.test(text)) return

    const parsed = parseEpisodeLabel(text, page.season)
    if (!parsed.episode || parsed.season !== page.season) return
    const url = absoluteUrl(anchor.attr('href') ?? page.url, page.url)
    const key = `${parsed.season}:${parsed.episode}`
    if (seen.has(key)) return
    seen.add(key)

    const nearby = compact(anchor.parent().text())
    const description = nearby.length > text.length ? nearby.replace(text, '').trim() : undefined
    episodes.push({
      season: parsed.season,
      episode: parsed.episode,
      weekName: parsed.weekName,
      hostingOrder: parsed.hostingOrder,
      title: parsed.clean,
      description: description && description.length <= 500 ? description : undefined,
      url,
      source: { ...source, url },
    })
  })

  if (!episodes.length) {
    const body = compact($('body').text())
    const regex = /(?:שבוע\s+)?([^,|–—-]+?)\s*[-–—]\s*יום\s+([אבגדה]'?).{0,120}?פרק\s*(\d+)/g
    for (const match of body.matchAll(regex)) {
      const episode = Number(match[3])
      const day = match[2].includes("'") ? match[2] : `${match[2]}'`
      episodes.push({
        season: page.season,
        episode,
        weekName: compact(match[1]),
        hostingOrder: dayOrder[day] ?? inferredHostingOrder(page.season, episode),
        title: compact(match[0]),
        url: page.url,
        source,
      })
    }
  }

  return episodes.sort((a, b) => a.episode - b.episode)
}

async function maybeWikipediaContestants() {
  try {
    return JSON.parse(await readFile(wikipediaFile, 'utf8')) as Contestant[]
  } catch {
    return []
  }
}

function inferWeek(episode: Episode) {
  if (episode.season >= 5 && episode.season <= 9) return Math.floor((episode.episode - 1) / 5) + 1
  return undefined
}

function explicitHostMatch(entry: Contestant, episodeText: string) {
  const episodeWords = new Set(words(episodeText))
  const cueText = compact(episodeText).normalize('NFKC').toLocaleLowerCase('he')
  for (const candidate of firstNameCandidates(entry.name)) {
    if (candidate.length < 2) continue
    const exactWord = episodeWords.has(candidate)
    const prefixedWord = ['ל', 'ב', 'מ', 'ו', 'כ', 'ה'].some((prefix) => episodeWords.has(`${prefix}${candidate}`))
    if (!exactWord && !prefixedWord) continue
    const escaped = escapeRegExp(candidate)
    const explicitCue = new RegExp(`(?:מארח(?:ת)?|יארח|תארח|אצל)\\s+${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u')
    if (explicitCue.test(cueText)) return true
  }
  return false
}

function selectHost(candidates: Contestant[], episode: Episode, text: string) {
  const byOrder = candidates.filter((entry) => entry.hostingOrder === episode.hostingOrder)
  if (byOrder.length === 1) {
    return {
      matched: byOrder[0],
      matchMethod: 'hosting-order' as const,
      diagnosticCandidates: byOrder.map((entry) => `${entry.name} (hosting order ${entry.hostingOrder})`),
    }
  }

  const byExplicitText = candidates.filter((entry) => explicitHostMatch(entry, text))
  if (byExplicitText.length === 1) {
    return {
      matched: byExplicitText[0],
      matchMethod: 'explicit-host-text' as const,
      diagnosticCandidates: byExplicitText.map((entry) => `${entry.name} (explicit host cue)`),
    }
  }

  return {
    matched: undefined,
    matchMethod: undefined,
    diagnosticCandidates: [
      ...byOrder.map((entry) => `${entry.name} (hosting order ${entry.hostingOrder})`),
      ...byExplicitText.map((entry) => `${entry.name} (explicit host cue)`),
    ],
  }
}

function buildKanContestants(episodes: Episode[], wikipediaContestants: Contestant[]) {
  const rows: Contestant[] = []
  const diagnostics: EnrichmentDiagnostic[] = []

  for (const episode of episodes) {
    if (episode.season < 5 || episode.season > 9 || !episode.hostingOrder) continue
    const week = inferWeek(episode)
    if (!week) continue

    const candidates = wikipediaContestants.filter((entry) => entry.season === episode.season && entry.week === week && entry.entryType !== 'couple')
    const text = `${episode.title} ${episode.description ?? ''}`
    const selection = selectHost(candidates, episode, text)
    const matched = selection.matched

    diagnostics.push({
      season: episode.season,
      episode: episode.episode,
      week,
      hostingOrder: episode.hostingOrder,
      matched: matched?.name,
      matchMethod: selection.matchMethod,
      candidates: selection.diagnosticCandidates,
      text: compact(text).slice(0, 300),
    })

    if (!matched) continue
    const source: SourceRef = {
      ...episode.source,
      url: episode.url,
      note: `Official Kan episode ${episode.episode}; host matched by ${selection.matchMethod === 'hosting-order' ? 'structured hosting order' : 'explicit host wording'}`,
    }

    rows.push({
      slug: matched.slug,
      name: matched.name,
      season: matched.season,
      entryType: matched.entryType,
      members: matched.members,
      week,
      weekName: episode.weekName ?? matched.weekName,
      hostingOrder: episode.hostingOrder,
      dishes: [],
      episodeUrls: [episode.url],
      sources: [source],
      fieldSources: {
        week: [source],
        ...(episode.weekName ? { weekName: [source] } : {}),
        hostingOrder: [source],
      },
    })
  }

  const deduped = [...new Map(rows.map((row) => [`${row.season}:${normalize(row.name)}`, row])).values()]
  return { rows: deduped, diagnostics }
}

async function main() {
  await mkdir(rawDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  const pages = JSON.parse(await readFile(configUrl, 'utf8')) as SeasonPage[]
  const all: Episode[] = []

  for (const page of pages) {
    try {
      const html = await fetchHtml(page.url)
      await writeFile(new URL(`season-${page.season}.html`, rawDir), html)
      const episodes = extractEpisodes(html, page)
      all.push(...episodes)
      console.log(`Kan season ${page.season}: ${episodes.length} episodes found`)
    } catch (error) {
      console.warn(`Kan season ${page.season} failed:`, error instanceof Error ? error.message : error)
    }
  }

  const deduped = [...new Map(all.map((episode) => [`${episode.season}:${episode.episode}`, episode])).values()]
    .sort((a, b) => a.season - b.season || a.episode - b.episode)
  await writeFile(normalizedFile, JSON.stringify(deduped, null, 2))

  const wikipediaContestants = await maybeWikipediaContestants()
  const enrichment = buildKanContestants(deduped, wikipediaContestants)
  await writeFile(contestantsFile, JSON.stringify(enrichment.rows, null, 2))
  await writeFile(enrichmentReportFile, JSON.stringify({
    matchedEntries: enrichment.rows.length,
    episodesConsidered: enrichment.diagnostics.length,
    matchedByHostingOrder: enrichment.diagnostics.filter((item) => item.matchMethod === 'hosting-order').length,
    matchedByExplicitHostText: enrichment.diagnostics.filter((item) => item.matchMethod === 'explicit-host-text').length,
    unmatchedEpisodes: enrichment.diagnostics.filter((item) => !item.matched).length,
    recipeDiscovery: {
      enabled: false,
      reason: 'Regular season 5–9 episode HTML exposed no direct per-host recipe links during the 2026-08-11 live import. See research/kan-recipes.md.',
    },
    diagnostics: enrichment.diagnostics,
  }, null, 2))

  console.log(`Saved ${deduped.length} official episode records with Kan attribution`)
  console.log(`Matched ${enrichment.rows.length}/${enrichment.diagnostics.length} season 5–9 hosting episodes to competition entries`)
  console.log(`Host match methods: ${enrichment.diagnostics.filter((item) => item.matchMethod === 'hosting-order').length} structured order, ${enrichment.diagnostics.filter((item) => item.matchMethod === 'explicit-host-text').length} explicit text`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

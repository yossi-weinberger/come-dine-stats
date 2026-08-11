import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, Dish, DishVariant, Episode, SourceRef } from '../lib/types'

type SeasonPage = { season: number; url: string }
type EnrichmentDiagnostic = {
  season: number
  episode: number
  week?: number
  hostingOrder?: number
  matched?: string
  candidates?: string[]
  recipeUrl?: string
  dishCount?: number
  recipeError?: string
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

function scoreCandidate(entry: Contestant, episodeText: string) {
  const normalizedText = normalize(episodeText)
  const fullName = normalize(entry.name)
  let score = fullName && normalizedText.includes(fullName) ? 100 : 0
  const episodeWords = new Set(words(episodeText))
  const cueText = compact(episodeText).normalize('NFKC').toLocaleLowerCase('he')
  const hebrewPrefixes = ['ל', 'ב', 'מ', 'ו', 'כ', 'ה']

  for (const candidate of firstNameCandidates(entry.name)) {
    if (candidate.length < 2) continue
    const exactWord = episodeWords.has(candidate)
    const prefixedWord = hebrewPrefixes.some((prefix) => episodeWords.has(`${prefix}${candidate}`))
    if (!exactWord && !prefixedWord) continue

    score += exactWord ? 20 : 10

    const escaped = escapeRegExp(candidate)
    const explicitHostCue = new RegExp(`(?:מארח(?:ת)?|יארח|תארח|אצל)\\s+${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u')
    if (explicitHostCue.test(cueText)) score += 60
  }

  return score
}

function recipeLinkFromEpisode(html: string, episodeUrl: string) {
  const $ = cheerio.load(html)
  let found: string | undefined
  $('a[href]').each((_, element) => {
    if (found) return
    const href = $(element).attr('href') ?? ''
    if (/\/content\/dig\/recipes\/\d+/i.test(href)) found = absoluteUrl(href, episodeUrl)
  })
  return found
}

function dishCourse(label: string): Dish['course'] | undefined {
  if (/^מנה\s+ראשונה/.test(label)) return 'starter'
  if (/^מנה\s+עיקרית/.test(label)) return 'main'
  if (/^קינוח/.test(label)) return 'dessert'
  return undefined
}

function dishVariant(label: string): DishVariant {
  if (/טבעוני/.test(label)) return 'vegan'
  if (/צמחוני/.test(label)) return 'vegetarian'
  if (/חלופ|תחליפ/.test(label)) return 'alternative'
  return 'standard'
}

function dishesFromRecipe(html: string, recipeUrl: string): Dish[] {
  const $ = cheerio.load(html)
  const dishes: Dish[] = []
  const seen = new Set<string>()
  const source: SourceRef = {
    kind: 'kan',
    title: 'כאן 11 — בואו לאכול איתי: המתכונים',
    url: recipeUrl,
    note: 'Official recipe page; only dish/menu titles are imported',
  }

  $('h2,h3').each((_, element) => {
    const heading = compact($(element).text())
    const course = dishCourse(heading)
    if (!course) return
    const separator = heading.search(/[:：]/)
    if (separator < 0) return
    const label = compact(heading.slice(0, separator))
    const name = compact(heading.slice(separator + 1))
    if (!name || /^(מרכיבים|אופן ההכנה|הגשה)$/u.test(name)) return
    const variant = dishVariant(label)
    const key = `${course}:${variant}:${normalize(name)}`
    if (seen.has(key)) return
    seen.add(key)
    dishes.push({
      course,
      variant,
      label,
      name,
      tags: variant === 'standard' ? undefined : [label],
      sources: [source],
    })
  })

  return dishes
}

async function importRecipeForEpisode(episode: Episode) {
  const episodeHtml = await fetchHtml(episode.url)
  const recipeUrl = recipeLinkFromEpisode(episodeHtml, episode.url)
  if (!recipeUrl) return { dishes: [] as Dish[], recipeUrl: undefined }
  const recipeHtml = await fetchHtml(recipeUrl)
  return { dishes: dishesFromRecipe(recipeHtml, recipeUrl), recipeUrl }
}

async function buildKanContestants(episodes: Episode[], wikipediaContestants: Contestant[]) {
  const rows: Contestant[] = []
  const diagnostics: EnrichmentDiagnostic[] = []

  for (const episode of episodes) {
    if (episode.season < 5 || episode.season > 9 || !episode.hostingOrder) continue
    const week = inferWeek(episode)
    if (!week) continue

    const candidates = wikipediaContestants.filter((entry) => entry.season === episode.season && entry.week === week && entry.entryType !== 'couple')
    const text = `${episode.title} ${episode.description ?? ''}`
    const ranked = candidates
      .map((entry) => ({ entry, score: scoreCandidate(entry, text) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)

    const top = ranked[0]
    const unique = top && (!ranked[1] || top.score > ranked[1].score)
    const matched = unique ? top.entry : undefined
    const diagnostic: EnrichmentDiagnostic = {
      season: episode.season,
      episode: episode.episode,
      week,
      hostingOrder: episode.hostingOrder,
      matched: matched?.name,
      candidates: ranked.slice(0, 3).map((item) => `${item.entry.name} (${item.score})`),
      text: compact(text).slice(0, 300),
    }

    if (!matched) {
      diagnostics.push(diagnostic)
      continue
    }

    let dishes: Dish[] = []
    let recipeUrl: string | undefined
    try {
      const recipe = await importRecipeForEpisode(episode)
      dishes = recipe.dishes
      recipeUrl = recipe.recipeUrl
      diagnostic.recipeUrl = recipeUrl
      diagnostic.dishCount = dishes.length
    } catch (error) {
      diagnostic.recipeError = error instanceof Error ? error.message : String(error)
    }
    diagnostics.push(diagnostic)

    const episodeSource: SourceRef = {
      ...episode.source,
      url: episode.url,
      note: `Official Kan episode ${episode.episode}; host matched from episode metadata`,
    }
    const recipeSource = recipeUrl ? dishes[0]?.sources?.[0] : undefined

    rows.push({
      slug: matched.slug,
      name: matched.name,
      season: matched.season,
      entryType: matched.entryType,
      members: matched.members,
      week,
      weekName: episode.weekName ?? matched.weekName,
      hostingOrder: episode.hostingOrder,
      dishes,
      episodeUrls: [episode.url],
      sources: recipeSource ? [episodeSource, recipeSource] : [episodeSource],
      fieldSources: {
        week: [episodeSource],
        ...(episode.weekName ? { weekName: [episodeSource] } : {}),
        hostingOrder: [episodeSource],
        ...(recipeSource && dishes.length ? { dishes: [recipeSource] } : {}),
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
  const enrichment = await buildKanContestants(deduped, wikipediaContestants)
  await writeFile(contestantsFile, JSON.stringify(enrichment.rows, null, 2))
  await writeFile(enrichmentReportFile, JSON.stringify({
    matchedEntries: enrichment.rows.length,
    episodesConsidered: enrichment.diagnostics.length,
    menuPagesFound: enrichment.diagnostics.filter((item) => item.recipeUrl).length,
    completeMenusImported: enrichment.diagnostics.filter((item) => item.dishCount === 3).length,
    dishesImported: enrichment.diagnostics.reduce((sum, item) => sum + (item.dishCount ?? 0), 0),
    recipeErrors: enrichment.diagnostics.filter((item) => item.recipeError).length,
    diagnostics: enrichment.diagnostics,
  }, null, 2))

  console.log(`Saved ${deduped.length} official episode records with Kan attribution`)
  console.log(`Matched ${enrichment.rows.length}/${enrichment.diagnostics.length} season 5–9 hosting episodes to competition entries`)
  console.log(`Imported ${enrichment.diagnostics.reduce((sum, item) => sum + (item.dishCount ?? 0), 0)} official menu titles from ${enrichment.diagnostics.filter((item) => item.recipeUrl).length} Kan recipe pages`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, Dish, DishVariant, SourceRef } from '../lib/types'

const normalizedDir = new URL('../data/normalized/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const kanFile = new URL('kan-contestants.json', normalizedDir)
const reportFile = new URL('kan-recipe-import.json', reportsDir)
const SITEINDEX = 'https://www.kan.org.il/media/sitemap/general/siteindex.xml'

type Candidate = Pick<Contestant, 'slug' | 'name' | 'season' | 'week' | 'weekName'>
type MatchStrategy = 'exact-name' | 'token-subset' | 'unique-first-name'
type RecipePage = { url: string; title: string; season?: number; weekName?: string; host?: string; dishes: Dish[] }
type MatchResult = { page: RecipePage; candidate?: Candidate; strategy?: MatchStrategy; reason?: string; candidates?: string[] }

function compact(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function normalizeWeekName(value?: string) {
  if (!value) return ''
  return compact(value).replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^ה(?=[\p{L}])/u, '')
}

function normalizeName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').replace(/["'״׳]/g, '').replace(/[().,;:–—-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function nameTokens(value: string) {
  return normalizeName(value).split(' ').filter(Boolean)
}

function xmlLocations(xml: string) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gs)].map((match) => match[1].replace(/&amp;/g, '&').trim()).filter(Boolean)
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { 'user-agent': 'come-dine-stats/0.4 (official Kan recipe importer)' } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

async function recipeArchiveUrls() {
  const sitemapUrls = xmlLocations(await fetchText(SITEINDEX))
  const sitemaps = await Promise.all(sitemapUrls.map(fetchText))
  return [...new Set(sitemaps.flatMap(xmlLocations).filter((url) => /\/content\/dig\/recipes\/\d+\/?$/u.test(url)))]
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function sourceFor(url: string, host: string): SourceRef {
  return {
    kind: 'kan',
    title: `כאן 11 — בואו לאכול איתי, המתכונים של ${host}`,
    url,
    note: 'Official Kan recipe page; only explicitly labeled courses are imported.',
  }
}

function courseFromHeading(heading: string): Dish['course'] | null {
  if (/^מנה\s+ראשונה(?:\s|:|[-–—])/u.test(heading)) return 'starter'
  if (/^מנה\s+עיקרית(?:\s|:|[-–—])/u.test(heading)) return 'main'
  if (/^קינוח(?:\s|:|[-–—])/u.test(heading)) return 'dessert'
  return null
}

function variantFromHeading(heading: string): DishVariant {
  if (/טבעונ/u.test(heading)) return 'vegan'
  if (/צמחונ|צימחונ/u.test(heading)) return 'vegetarian'
  return 'standard'
}

function dishFromHeading(rawHeading: string, source: SourceRef): Dish | null {
  const heading = compact(rawHeading)
  const course = courseFromHeading(heading)
  if (!course) return null
  const variant = variantFromHeading(heading)
  const prefix = course === 'starter' ? /^מנה\s+ראשונה/u : course === 'main' ? /^מנה\s+עיקרית/u : /^קינוח/u
  const value = compact(heading.replace(prefix, '').replace(/^\s+(?:טבעונית|טבעוני|צמחונית|צמחוני|צימחונית|צימחוני)/u, '').replace(/^\s*[:–—-]\s*/u, ''))
  if (!value) return null
  const [namePart, ...descriptionParts] = value.split(/\s+-\s+/)
  const name = compact(namePart.replace(/^["“”]|["“”]$/g, ''))
  if (!name) return null
  const courseLabel = course === 'starter' ? 'מנה ראשונה' : course === 'main' ? 'מנה עיקרית' : 'קינוח'
  return {
    course,
    variant,
    label: variant === 'standard' ? courseLabel : `${courseLabel} ${variant === 'vegan' ? 'טבעונית' : 'צמחונית'}`,
    name,
    description: compact(descriptionParts.join(' - ')) || undefined,
    tags: variant === 'standard' ? undefined : [variant === 'vegan' ? 'טבעונית' : 'צמחונית'],
    sources: [source],
  }
}

function parseRecipePage(url: string, html: string): RecipePage | null {
  const $ = cheerio.load(html)
  const ogTitle = $('meta[property="og:title"]').attr('content')
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content')
  const title = compact($('h1').first().text() || ogTitle || $('title').text())
  const imageMetadata = $('img[alt],img[title]').map((_, element) => [$(element).attr('alt'), $(element).attr('title')])
    .get().flat().filter((value): value is string => Boolean(value && /בואו לאכול איתי/u.test(value)))
  const bodyText = compact($('main').text() || $('body').text())
  const metadataText = [...new Set([title, ogTitle, description, ...imageMetadata, bodyText.slice(0, 1800)].filter(Boolean).map((value) => compact(value as string)))].join(' | ')
  if (!/בואו לאכול איתי/u.test(metadataText)) return null

  const structured = metadataText.match(/בואו לאכול איתי\s*עונה\s*(\d+)\s*[|｜]\s*שבוע\s+(.+?)\s*[-–—]\s*המתכונים של\s+([^|]+?)(?=\s*[|｜]|$)/u)
  const season = structured?.[1] ? Number(structured[1]) : Number(metadataText.match(/בואו לאכול איתי[^\d]{0,30}עונה\s*(\d+)/u)?.[1]) || undefined
  const weekName = structured?.[2] ? compact(structured[2]) : undefined
  const host = structured?.[3] ? compact(structured[3]) : compact(title.match(/המתכונים של\s+(.+?)(?=\s*[|｜–—-]|$)/u)?.[1] || '') || undefined
  if (!season || !weekName || !host) return { url, title, season, weekName, host, dishes: [] }

  const source = sourceFor(url, host)
  const dishes = $('h1,h2,h3,h4,h5').map((_, element) => dishFromHeading($(element).text(), source)).get()
    .filter((dish): dish is Dish => Boolean(dish))
  const uniqueDishes = [...new Map(dishes.map((dish) => [`${dish.course}:${dish.variant}:${normalizeName(dish.name)}`, dish])).values()]
  return { url, title, season, weekName, host, dishes: uniqueDishes }
}

function candidateFrom(row: Contestant): Candidate {
  return { slug: row.slug, name: row.name, season: row.season, week: row.week, weekName: row.weekName }
}

async function readCandidateContext(kanRows: Contestant[]) {
  const byKey = new Map<string, Candidate>()
  for (const row of kanRows) {
    if (row.weekName) byKey.set(`${row.season}:${normalizeName(row.name)}`, candidateFrom(row))
  }
  for (const file of ['contestants.json', 'wikipedia-contestants.json']) {
    try {
      const rows = JSON.parse(await readFile(new URL(file, normalizedDir), 'utf8')) as Contestant[]
      for (const row of rows) {
        if (!row.weekName) continue
        const key = `${row.season}:${normalizeName(row.name)}`
        if (!byKey.has(key)) byKey.set(key, candidateFrom(row))
      }
    } catch {}
  }
  return [...byKey.values()]
}

function subset(left: string[], right: string[]) {
  const set = new Set(right)
  return left.every((token) => set.has(token))
}

function matchRecipePage(page: RecipePage, allCandidates: Candidate[]): MatchResult {
  if (!page.season || !page.weekName || !page.host) return { page, reason: 'missing-structured-season-week-host' }
  const weekCandidates = allCandidates.filter((candidate) => candidate.season === page.season && normalizeWeekName(candidate.weekName) === normalizeWeekName(page.weekName))
  if (!weekCandidates.length) return { page, reason: 'no-candidates-for-season-week' }

  const exact = weekCandidates.filter((candidate) => normalizeName(candidate.name) === normalizeName(page.host as string))
  if (exact.length === 1) return { page, candidate: exact[0], strategy: 'exact-name' }
  if (exact.length > 1) return { page, reason: 'ambiguous-exact-name', candidates: exact.map((candidate) => candidate.name) }

  const hostTokens = nameTokens(page.host)
  const tokenMatches = weekCandidates.filter((candidate) => {
    const candidateTokens = nameTokens(candidate.name)
    return subset(hostTokens, candidateTokens) || subset(candidateTokens, hostTokens)
  })
  if (tokenMatches.length === 1) return { page, candidate: tokenMatches[0], strategy: 'token-subset' }
  if (tokenMatches.length > 1) return { page, reason: 'ambiguous-token-subset', candidates: tokenMatches.map((candidate) => candidate.name) }

  const firstNameMatches = weekCandidates.filter((candidate) => nameTokens(candidate.name)[0] === hostTokens[0])
  if (firstNameMatches.length === 1) return { page, candidate: firstNameMatches[0], strategy: 'unique-first-name' }
  return { page, reason: firstNameMatches.length > 1 ? 'ambiguous-first-name' : 'no-safe-name-match', candidates: (firstNameMatches.length ? firstNameMatches : weekCandidates).map((candidate) => candidate.name) }
}

function dishKey(dish: Dish) {
  return `${dish.course}:${dish.variant ?? 'standard'}:${normalizeName(dish.name)}`
}

function uniqueSources(sources: SourceRef[]) {
  return [...new Map(sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
}

function enrichKanRow(row: Contestant, dishes: Dish[]) {
  const mergedDishes = new Map(row.dishes.map((dish) => [dishKey(dish), dish]))
  for (const dish of dishes) {
    const key = dishKey(dish)
    const existing = mergedDishes.get(key)
    mergedDishes.set(key, existing ? { ...existing, sources: uniqueSources([...(existing.sources ?? []), ...(dish.sources ?? [])]) } : dish)
  }
  const recipeSources = uniqueSources(dishes.flatMap((dish) => dish.sources ?? []))
  row.dishes = [...mergedDishes.values()]
  row.sources = uniqueSources([...row.sources, ...recipeSources])
  row.fieldSources = { ...(row.fieldSources ?? {}), dishes: uniqueSources([...(row.fieldSources?.dishes ?? []), ...recipeSources]) }
}

async function main() {
  await mkdir(reportsDir, { recursive: true })
  const kanRows = JSON.parse(await readFile(kanFile, 'utf8')) as Contestant[]
  const [urls, candidates] = await Promise.all([recipeArchiveUrls(), readCandidateContext(kanRows)])
  const errors: Array<{ url: string; error: string }> = []
  const parsed = await mapWithConcurrency(urls, 12, async (url) => {
    try { return parseRecipePage(url, await fetchText(url)) }
    catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  })

  const showPages = parsed.filter((page): page is RecipePage => Boolean(page))
  const structuredPages = showPages.filter((page) => page.season && page.weekName && page.host && page.dishes.length)
  const results = structuredPages.map((page) => matchRecipePage(page, candidates))
  const matched = results.filter((result): result is MatchResult & { candidate: Candidate; strategy: MatchStrategy } => Boolean(result.candidate && result.strategy))
  const unmatched = results.filter((result) => !result.candidate)
  const kanByKey = new Map(kanRows.map((row) => [`${row.season}:${normalizeName(row.name)}`, row]))
  const enriched: Array<MatchResult & { candidate: Candidate; strategy: MatchStrategy }> = []
  const noKanTarget: Array<MatchResult & { candidate: Candidate; strategy: MatchStrategy }> = []

  for (const result of matched) {
    const target = kanByKey.get(`${result.candidate.season}:${normalizeName(result.candidate.name)}`)
    if (!target) {
      noKanTarget.push(result)
      continue
    }
    enrichKanRow(target, result.page.dishes)
    enriched.push(result)
  }

  const completeStandard = (dishes: Dish[]) => ['starter','main','dessert'].every((course) => dishes.some((dish) => dish.course === course && (dish.variant ?? 'standard') === 'standard'))
  const report = {
    rule: 'Enrich only existing Kan contestant rows from official Kan recipe pages with explicit season + week + host metadata, explicit course headings, and a unique safe match within the same season/week.',
    recipeArchivePages: urls.length,
    fetchedPages: urls.length - errors.length,
    showPages: showPages.length,
    structuredMenuPages: structuredPages.length,
    matchedMenus: enriched.length,
    matchedDishes: enriched.reduce((sum, result) => sum + result.page.dishes.length, 0),
    completeStandardMenus: enriched.filter((result) => completeStandard(result.page.dishes)).length,
    matchStrategies: Object.fromEntries(['exact-name','token-subset','unique-first-name'].map((strategy) => [strategy, enriched.filter((result) => result.strategy === strategy).length])),
    bySeason: Object.fromEntries([...new Set(enriched.map((result) => result.page.season as number))].sort((a,b) => a-b).map((season) => [season, enriched.filter((result) => result.page.season === season).length])),
    errors,
    noKanTarget: noKanTarget.map((result) => ({ url: result.page.url, season: result.page.season, weekName: result.page.weekName, host: result.page.host, contestant: result.candidate.name, strategy: result.strategy })),
    unmatched: unmatched.map(({ page, reason, candidates }) => ({ url: page.url, season: page.season, weekName: page.weekName, host: page.host, title: page.title, dishes: page.dishes.length, reason, candidates })),
    matched: enriched.map(({ page, candidate, strategy }) => ({ url: page.url, season: page.season, weekName: page.weekName, recipeHost: page.host, contestant: candidate.name, strategy, dishes: page.dishes.map((dish) => ({ course: dish.course, variant: dish.variant ?? 'standard', name: dish.name })) })),
  }

  await writeFile(kanFile, JSON.stringify(kanRows, null, 2))
  await writeFile(reportFile, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    recipeArchivePages: report.recipeArchivePages,
    showPages: report.showPages,
    structuredMenuPages: report.structuredMenuPages,
    matchedMenus: report.matchedMenus,
    matchedDishes: report.matchedDishes,
    completeStandardMenus: report.completeStandardMenus,
    matchStrategies: report.matchStrategies,
    bySeason: report.bySeason,
    unmatched: report.unmatched.length,
    noKanTarget: report.noKanTarget.length,
    errors: report.errors.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

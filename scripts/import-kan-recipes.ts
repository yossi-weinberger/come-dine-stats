import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, Dish, DishVariant, SourceRef } from '../lib/types'

const normalizedDir = new URL('../data/normalized/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const outputFile = new URL('kan-recipe-contestants.json', normalizedDir)
const reportFile = new URL('kan-recipe-import.json', reportsDir)
const SITEINDEX = 'https://www.kan.org.il/media/sitemap/general/siteindex.xml'

type Candidate = Pick<Contestant, 'slug' | 'name' | 'season' | 'week' | 'weekName'>
type MatchStrategy = 'exact-name' | 'token-subset' | 'unique-first-name'
type RecipePage = {
  url: string
  title: string
  season?: number
  weekName?: string
  host?: string
  dishes: Dish[]
}

type MatchResult = {
  page: RecipePage
  candidate?: Candidate
  strategy?: MatchStrategy
  reason?: string
  candidates?: string[]
}

function compact(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function normalizeWeekName(value?: string) {
  if (!value) return ''
  return compact(value)
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^ה(?=[\p{L}])/u, '')
}

function normalizeName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .replace(/["'״׳().,;:–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(value: string) {
  return normalizeName(value).split(' ').filter(Boolean)
}

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
}

function xmlLocations(xml: string) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gs)]
    .map((match) => match[1].replace(/&amp;/g, '&').trim())
    .filter(Boolean)
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'come-dine-stats/0.4 (official Kan recipe importer)' },
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

async function recipeArchiveUrls() {
  const index = await fetchText(SITEINDEX)
  const sitemapUrls = xmlLocations(index)
  const sitemaps = await Promise.all(sitemapUrls.map(fetchText))
  return [...new Set(
    sitemaps
      .flatMap(xmlLocations)
      .filter((url) => /\/content\/dig\/recipes\/\d+\/?$/u.test(url)),
  )]
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
    note: 'Official Kan recipe page; course labels and menu text are imported only when explicitly present on the page.',
  }
}

function courseFromHeading(heading: string): Dish['course'] | null {
  if (/^מנה\s+ראשונה(?:\s|:)/u.test(heading)) return 'starter'
  if (/^מנה\s+עיקרית(?:\s|:)/u.test(heading)) return 'main'
  if (/^קינוח(?:\s|:)/u.test(heading)) return 'dessert'
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
  const value = compact(heading.replace(/^מנה\s+ראשונה(?:\s+(?:טבעונית|צמחונית|צימחונית))?\s*:\s*/u, '')
    .replace(/^מנה\s+עיקרית(?:\s+(?:טבעונית|צמחונית|צימחונית))?\s*:\s*/u, '')
    .replace(/^קינוח(?:\s+(?:טבעוני|טבעונית|צמחוני|צמחונית|צימחוני|צימחונית))?\s*:\s*/u, ''))
  if (!value || value === heading) return null

  const [namePart, ...descriptionParts] = value.split(/\s+-\s+/)
  const name = compact(namePart.replace(/^(["“”])|(["“”])$/g, ''))
  if (!name) return null
  const description = compact(descriptionParts.join(' - ')) || undefined
  return {
    course,
    variant,
    label: heading.slice(0, heading.indexOf(':') > -1 ? heading.indexOf(':') : heading.length),
    name,
    description,
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
  const host = structured?.[3]
    ? compact(structured[3])
    : compact(title.match(/המתכונים של\s+(.+?)(?=\s*[|｜–—-]|$)/u)?.[1] || '') || undefined

  if (!season || !weekName || !host) return { url, title, season, weekName, host, dishes: [] }
  const source = sourceFor(url, host)
  const headings = $('h1,h2,h3,h4,h5').map((_, element) => $(element).text()).get()
  const dishes = headings.map((heading) => dishFromHeading(heading, source)).filter((dish): dish is Dish => Boolean(dish))
  const uniqueDishes = [...new Map(dishes.map((dish) => [`${dish.course}:${dish.variant}:${normalizeName(dish.name)}`, dish])).values()]
  return { url, title, season, weekName, host, dishes: uniqueDishes }
}

async function readCandidates() {
  const files = ['contestants.json', 'kan-contestants.json', 'wikipedia-contestants.json']
  const byKey = new Map<string, Candidate>()
  for (const file of files) {
    try {
      const rows = JSON.parse(await readFile(new URL(file, normalizedDir), 'utf8')) as Contestant[]
      for (const row of rows) {
        if (!row.weekName) continue
        const key = `${row.season}:${normalizeName(row.name)}`
        if (!byKey.has(key)) byKey.set(key, { slug: row.slug, name: row.name, season: row.season, week: row.week, weekName: row.weekName })
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
  const weekCandidates = allCandidates.filter((candidate) =>
    candidate.season === page.season && normalizeWeekName(candidate.weekName) === normalizeWeekName(page.weekName),
  )
  if (!weekCandidates.length) return { page, reason: 'no-candidates-for-season-week' }

  const hostNormalized = normalizeName(page.host)
  const exact = weekCandidates.filter((candidate) => normalizeName(candidate.name) === hostNormalized)
  if (exact.length === 1) return { page, candidate: exact[0], strategy: 'exact-name' }
  if (exact.length > 1) return { page, reason: 'ambiguous-exact-name', candidates: exact.map((candidate) => candidate.name) }

  const hostTokens = nameTokens(page.host)
  const tokenMatches = weekCandidates.filter((candidate) => {
    const candidateTokens = nameTokens(candidate.name)
    return subset(hostTokens, candidateTokens) || subset(candidateTokens, hostTokens)
  })
  if (tokenMatches.length === 1) return { page, candidate: tokenMatches[0], strategy: 'token-subset' }
  if (tokenMatches.length > 1) return { page, reason: 'ambiguous-token-subset', candidates: tokenMatches.map((candidate) => candidate.name) }

  const firstToken = hostTokens[0]
  const firstNameMatches = weekCandidates.filter((candidate) => nameTokens(candidate.name)[0] === firstToken)
  if (firstNameMatches.length === 1) return { page, candidate: firstNameMatches[0], strategy: 'unique-first-name' }
  return {
    page,
    reason: firstNameMatches.length > 1 ? 'ambiguous-first-name' : 'no-safe-name-match',
    candidates: (firstNameMatches.length ? firstNameMatches : weekCandidates).map((candidate) => candidate.name),
  }
}

async function main() {
  await mkdir(normalizedDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  const [urls, candidates] = await Promise.all([recipeArchiveUrls(), readCandidates()])
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

  const output: Contestant[] = matched.map(({ page, candidate }) => ({
    slug: candidate.slug || `${page.season}-${slugify(candidate.name)}`,
    name: candidate.name,
    season: page.season as number,
    dishes: page.dishes,
    sources: [...new Map(page.dishes.flatMap((dish) => dish.sources ?? []).map((source) => [`${source.kind}:${source.url}`, source])).values()],
    fieldSources: { dishes: [...new Map(page.dishes.flatMap((dish) => dish.sources ?? []).map((source) => [`${source.kind}:${source.url}`, source])).values()] },
  }))

  const report = {
    rule: 'Import only official Kan recipe pages with explicit season + week + host metadata, an explicit course heading, and a unique safe match to an existing contestant in the same season/week.',
    recipeArchivePages: urls.length,
    fetchedPages: urls.length - errors.length,
    showPages: showPages.length,
    structuredMenuPages: structuredPages.length,
    matchedMenus: output.length,
    matchedDishes: output.reduce((sum, row) => sum + row.dishes.length, 0),
    completeStandardMenus: output.filter((row) => ['starter','main','dessert'].every((course) => row.dishes.some((dish) => dish.course === course && (dish.variant ?? 'standard') === 'standard'))).length,
    matchStrategies: Object.fromEntries(['exact-name','token-subset','unique-first-name'].map((strategy) => [strategy, matched.filter((result) => result.strategy === strategy).length])),
    bySeason: Object.fromEntries([...new Set(output.map((row) => row.season))].sort((a,b) => a-b).map((season) => [season, output.filter((row) => row.season === season).length])),
    errors,
    unmatched: unmatched.map(({ page, reason, candidates }) => ({ url: page.url, season: page.season, weekName: page.weekName, host: page.host, title: page.title, dishes: page.dishes.length, reason, candidates })),
    matched: matched.map(({ page, candidate, strategy }) => ({ url: page.url, season: page.season, weekName: page.weekName, recipeHost: page.host, contestant: candidate.name, strategy, dishes: page.dishes.map((dish) => ({ course: dish.course, variant: dish.variant ?? 'standard', name: dish.name })) })),
  }

  await writeFile(outputFile, JSON.stringify(output, null, 2))
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
    errors: report.errors.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import * as cheerio from 'cheerio'
import episodesJson from '../data/normalized/kan-episodes.json'

type Episode = { season: number; episode: number; title: string; url: string }
type Discovery = {
  season: number
  episode: number
  title: string
  episodeUrl: string
  recipeUrls: string[]
  recipeAnchors: Array<{ text: string; href: string }>
}
type ShowRecipePage = {
  url: string
  title: string
  season?: number
  weekName?: string
  host?: string
  showMetadata: string[]
  courseHeadings: string[]
  bodyIntro: string
}

const episodes = episodesJson as Episode[]
const targetSeason = Number(process.env.KAN_RECIPE_SEASON || '5')
const mode = process.env.KAN_RECIPE_MODE || 'episodes'
const HUB = 'https://www.kan.org.il/content/dig/recipes/'
const SITEINDEX = 'https://www.kan.org.il/media/sitemap/general/siteindex.xml'

function compact(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString() } catch { return href }
}

function normalizeRecipeUrl(value: string, base: string) {
  const unescaped = value.replace(/\\\//g, '/')
  const match = unescaped.match(/(?:https?:\/\/www\.kan\.org\.il)?(\/content\/dig\/recipes\/\d+\/?)/u)
  return match ? absoluteUrl(match[1], base) : null
}

function extractRecipeUrls(html: string, base: string) {
  const found = new Set<string>()
  const patterns = [
    /https?:\/\/www\.kan\.org\.il\/content\/dig\/recipes\/\d+\/?/gu,
    /\/content\/dig\/recipes\/\d+\/?/gu,
    /\\\/content\\\/dig\\\/recipes\\\/\d+\\\/?/gu,
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = normalizeRecipeUrl(match[0], base)
      if (url) found.add(url)
    }
  }
  return [...found]
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'come-dine-stats/0.4 (official-source recipe discovery)' },
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

function xmlLocations(xml: string) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gs)]
    .map((match) => match[1].replace(/&amp;/g, '&').trim())
    .filter(Boolean)
}

function recipeId(url: string) {
  const match = url.match(/\/recipes\/(\d+)\/?/u)
  return match ? Number(match[1]) : null
}

async function recipeArchiveUrls() {
  const siteindexXml = await fetchHtml(SITEINDEX)
  const sitemapLocations = xmlLocations(siteindexXml)
  const sitemapXmls = await Promise.all(sitemapLocations.map(fetchHtml))
  return [...new Set(
    sitemapXmls
      .flatMap(xmlLocations)
      .filter((url) => /\/content\/dig\/recipes\/\d+\/?$/u.test(url)),
  )].sort((a, b) => (recipeId(a) ?? 0) - (recipeId(b) ?? 0))
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)).map(compact).filter(Boolean))]
}

function parseShowRecipePage(url: string, html: string): ShowRecipePage | null {
  const $ = cheerio.load(html)
  const ogTitle = $('meta[property="og:title"]').attr('content')
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content')
  const title = compact($('h1').first().text() || ogTitle || $('title').text())
  const imageMetadata = $('img[alt],img[title]').map((_, element) => {
    const alt = $(element).attr('alt')
    const imageTitle = $(element).attr('title')
    return [alt, imageTitle].filter((value) => value && /בואו לאכול איתי/u.test(value))
  }).get().flat() as string[]
  const showMetadata = unique([title, ogTitle, description, ...imageMetadata]).filter((value) => /בואו לאכול איתי/u.test(value) || /המתכונים של/u.test(value))
  const bodyText = compact($('main').text() || $('body').text())
  if (![...showMetadata, bodyText].some((value) => /בואו לאכול איתי/u.test(value))) return null

  const metadataText = unique([ ...imageMetadata, title, ogTitle, description, bodyText.slice(0, 1800) ]).join(' | ')
  const structured = metadataText.match(/בואו לאכול איתי\s*עונה\s*(\d+)\s*[|｜]\s*שבוע\s+(.+?)\s*[-–—]\s*המתכונים של\s+([^|]+?)(?=\s*[|｜]|$)/u)
  const season = structured?.[1] ? Number(structured[1]) : Number(metadataText.match(/בואו לאכול איתי[^\d]{0,30}עונה\s*(\d+)/u)?.[1]) || undefined
  const weekName = structured?.[2] ? compact(structured[2]) : undefined
  const hostFromStructured = structured?.[3] ? compact(structured[3]) : undefined
  const hostFromTitle = (title.match(/המתכונים של\s+(.+?)(?=\s*[|｜–—-]|$)/u)?.[1] || '').trim()
  const host = hostFromStructured || hostFromTitle || undefined

  const headings = unique($('h1,h2,h3,h4,h5').map((_, element) => $(element).text()).get())
  const courseHeadings = headings.filter((heading) => /מנה\s+ראשונה|מנה\s+עיקרית|קינוח|מה בתפריט/u.test(heading))

  return {
    url,
    title,
    season,
    weekName,
    host,
    showMetadata: showMetadata.slice(0, 8),
    courseHeadings,
    bodyIntro: bodyText.slice(0, 900),
  }
}

async function probeArchive() {
  const urls = await recipeArchiveUrls()
  const errors: Array<{ url: string; error: string }> = []
  const pages = await mapWithConcurrency(urls, 12, async (url) => {
    try {
      const html = await fetchHtml(url)
      return parseShowRecipePage(url, html)
    } catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  })
  const showPages = pages.filter((page): page is ShowRecipePage => Boolean(page))
  const bySeason = Object.fromEntries(
    [...new Set(showPages.map((page) => page.season).filter((season): season is number => season != null))]
      .sort((a, b) => a - b)
      .map((season) => [season, showPages.filter((page) => page.season === season).length]),
  )
  const unknownSeason = showPages.filter((page) => page.season == null).length
  const withCourseHeadings = showPages.filter((page) => page.courseHeadings.length).length
  const withStructuredHost = showPages.filter((page) => page.host).length

  console.log(JSON.stringify({
    mode: 'scan',
    recipeArchiveCount: urls.length,
    fetched: urls.length - errors.length,
    errors,
    showRecipePages: showPages.length,
    bySeason,
    unknownSeason,
    withStructuredHost,
    withCourseHeadings,
    pages: showPages,
  }, null, 2))
}

async function probeHubAndSitemap() {
  const [urls, hubHtml] = await Promise.all([recipeArchiveUrls(), fetchHtml(HUB)])
  const hub$ = cheerio.load(hubHtml)
  const hubAnchors = hub$('a[href]').map((_, element) => {
    const href = absoluteUrl(hub$(element).attr('href') || '', HUB)
    const text = compact(hub$(element).text())
    if (!/recipe|מתכונ|\/content\/dig\/recipes\//iu.test(`${text} ${href}`)) return null
    return { text, href }
  }).get().filter(Boolean)

  console.log(JSON.stringify({
    mode: 'sitemap',
    recipeArchiveCount: urls.length,
    lowestRecipeUrls: urls.slice(0, 40),
    highestRecipeUrls: urls.slice(-40),
    hub: {
      bytes: hubHtml.length,
      directRecipeUrls: extractRecipeUrls(hubHtml, HUB),
      recipeAnchors: hubAnchors.slice(0, 30),
    },
  }, null, 2))
}

async function probeEpisodes() {
  const targets = episodes.filter((episode) => episode.season === targetSeason)
  const discoveries: Discovery[] = []
  for (const episode of targets) {
    const html = await fetchHtml(episode.url)
    const $ = cheerio.load(html)
    const recipeAnchors = $('a').map((_, element) => {
      const href = $(element).attr('href') || ''
      const text = compact($(element).text())
      if (!/מתכונ/u.test(text) && !/\/content\/dig\/recipes\//u.test(href)) return null
      return { text, href: absoluteUrl(href, episode.url) }
    }).get().filter(Boolean) as Array<{ text: string; href: string }>
    const recipeUrls = new Set(extractRecipeUrls(html, episode.url))
    for (const anchor of recipeAnchors) {
      const recipeUrl = normalizeRecipeUrl(anchor.href, episode.url)
      if (recipeUrl) recipeUrls.add(recipeUrl)
    }
    discoveries.push({ season: episode.season, episode: episode.episode, title: episode.title, episodeUrl: episode.url, recipeUrls: [...recipeUrls], recipeAnchors })
  }
  console.log(JSON.stringify({
    mode: 'episodes',
    season: targetSeason,
    episodesChecked: discoveries.length,
    episodesWithRecipeUrl: discoveries.filter((item) => item.recipeUrls.length).length,
    episodesWithRecipeText: discoveries.filter((item) => item.recipeAnchors.length).length,
    discoveries: discoveries.filter((item) => item.recipeUrls.length || item.recipeAnchors.length),
  }, null, 2))
}

async function main() {
  if (mode === 'scan') return probeArchive()
  if (mode === 'sitemap') return probeHubAndSitemap()
  return probeEpisodes()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

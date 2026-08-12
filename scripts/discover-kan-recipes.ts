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

const episodes = episodesJson as Episode[]
const targetSeason = Number(process.env.KAN_RECIPE_SEASON || '5')
const mode = process.env.KAN_RECIPE_MODE || 'episodes'
const HUB = 'https://www.kan.org.il/content/dig/recipes/'
const SITEINDEX = 'https://www.kan.org.il/media/sitemap/general/siteindex.xml'

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

function snippets(html: string, terms: RegExp[]) {
  const flat = html.replace(/\s+/g, ' ')
  const rows: string[] = []
  for (const term of terms) {
    term.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = term.exec(flat)) && rows.length < 12) {
      const start = Math.max(0, match.index - 140)
      const end = Math.min(flat.length, match.index + match[0].length + 260)
      rows.push(flat.slice(start, end))
      if (!term.global) break
    }
  }
  return [...new Set(rows)]
}

function recipeId(url: string) {
  const match = url.match(/\/recipes\/(\d+)\/?/u)
  return match ? Number(match[1]) : null
}

async function probeHubAndSitemap() {
  const [siteindexXml, hubHtml] = await Promise.all([fetchHtml(SITEINDEX), fetchHtml(HUB)])
  const sitemapLocations = xmlLocations(siteindexXml)
  const sitemapXmls = await Promise.all(sitemapLocations.map(async (url) => ({ url, xml: await fetchHtml(url) })))
  const allSitemapPages = sitemapXmls.flatMap(({ xml }) => xmlLocations(xml))
  const recipeArchiveUrls = [...new Set(allSitemapPages.filter((url) => /\/content\/dig\/recipes\/\d+\/?$/u.test(url)))]
    .sort((a, b) => (recipeId(a) ?? 0) - (recipeId(b) ?? 0))

  const hub$ = cheerio.load(hubHtml)
  const scriptSources = hub$('script[src]').map((_, element) => absoluteUrl(hub$(element).attr('src') || '', HUB)).get()
  const hubAnchors = hub$('a[href]').map((_, element) => {
    const href = absoluteUrl(hub$(element).attr('href') || '', HUB)
    const text = hub$(element).text().replace(/\s+/g, ' ').trim()
    if (!/recipe|מתכונ|\/content\/dig\/recipes\//iu.test(`${text} ${href}`)) return null
    return { text, href }
  }).get().filter(Boolean)

  console.log(JSON.stringify({
    mode: 'sitemap',
    siteindex: {
      url: SITEINDEX,
      locations: sitemapLocations.length,
      sitemapFiles: sitemapXmls.map(({ url, xml }) => ({ url, bytes: xml.length, pages: xmlLocations(xml).length })),
      totalPages: allSitemapPages.length,
      recipeArchiveCount: recipeArchiveUrls.length,
      lowestRecipeUrls: recipeArchiveUrls.slice(0, 40),
      highestRecipeUrls: recipeArchiveUrls.slice(-40),
    },
    hub: {
      url: HUB,
      bytes: hubHtml.length,
      directRecipeUrls: extractRecipeUrls(hubHtml, HUB),
      recipeAnchors: hubAnchors.slice(0, 30),
      scriptSources: scriptSources.slice(0, 30),
      interestingSnippets: snippets(hubHtml, [/recipes/giu, /מתכונ/gu, /\/api\//giu]),
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
      const text = $(element).text().replace(/\s+/g, ' ').trim()
      if (!/מתכונ/u.test(text) && !/\/content\/dig\/recipes\//u.test(href)) return null
      return { text, href: absoluteUrl(href, episode.url) }
    }).get().filter(Boolean) as Array<{ text: string; href: string }>

    const recipeUrls = new Set(extractRecipeUrls(html, episode.url))
    for (const anchor of recipeAnchors) {
      const url = normalizeRecipeUrl(anchor.href, episode.url)
      if (url) recipeUrls.add(url)
    }

    discoveries.push({
      season: episode.season,
      episode: episode.episode,
      title: episode.title,
      episodeUrl: episode.url,
      recipeUrls: [...recipeUrls],
      recipeAnchors,
    })
  }

  const withRecipeUrl = discoveries.filter((item) => item.recipeUrls.length)
  const withRecipeText = discoveries.filter((item) => item.recipeAnchors.length)
  console.log(JSON.stringify({
    mode: 'episodes',
    season: targetSeason,
    episodesChecked: discoveries.length,
    episodesWithRecipeUrl: withRecipeUrl.length,
    episodesWithRecipeText: withRecipeText.length,
    discoveries: discoveries.filter((item) => item.recipeUrls.length || item.recipeAnchors.length),
  }, null, 2))
}

async function main() {
  if (mode === 'sitemap') return probeHubAndSitemap()
  return probeEpisodes()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

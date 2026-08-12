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

async function main() {
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
    season: targetSeason,
    episodesChecked: discoveries.length,
    episodesWithRecipeUrl: withRecipeUrl.length,
    episodesWithRecipeText: withRecipeText.length,
    discoveries: discoveries.filter((item) => item.recipeUrls.length || item.recipeAnchors.length),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

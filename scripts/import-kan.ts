import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Episode, SourceRef } from '../lib/types'

type SeasonPage = { season: number; url: string }
const configUrl = new URL('../data/kan-season-pages.json', import.meta.url)
const rawDir = new URL('../data/raw/kan/', import.meta.url)
const normalizedFile = new URL('../data/normalized/kan-episodes.json', import.meta.url)

const dayOrder: Record<string, number> = { "א'": 1, "ב'": 2, "ג'": 3, "ד'": 4, "ה'": 5 }

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'come-dine-stats/0.2 (metadata importer; source links preserved)',
    },
  })
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString() } catch { return base }
}

function parseEpisodeLabel(text: string, fallbackSeason: number) {
  const clean = compact(text)
  const season = Number(clean.match(/עונה\s*(\d+)/)?.[1] ?? fallbackSeason)
  const episode = Number(clean.match(/פרק\s*(\d+)/)?.[1])
  const weekName = clean.match(/שבוע\s+([^,|–—-]+?)(?=,\s*יום|\s*[|–—-])/u)?.[1]?.trim()
  const day = clean.match(/יום\s+([אבגדה]'?)/u)?.[1]
  return {
    season,
    episode: Number.isFinite(episode) && episode > 0 ? episode : undefined,
    weekName,
    hostingOrder: day ? dayOrder[day.includes("'") ? day : `${day}'`] : undefined,
  }
}

function extractEpisodes(html: string, page: SeasonPage): Episode[] {
  const $ = cheerio.load(html)
  const source: SourceRef = {
    kind: 'kan',
    title: 'כאן 11 — בואו לאכול איתי',
    url: page.url,
    note: 'Official episode archive; factual metadata and links only',
    retrievedAt: new Date().toISOString(),
  }
  const episodes: Episode[] = []
  const seen = new Set<string>()

  $('a').each((_, element) => {
    const anchor = $(element)
    const text = compact(anchor.text())
    if (!/פרק\s*\d+/.test(text)) return
    if (!text.includes('בואו לאכול איתי') && !text.includes('שבוע') && !text.includes('יום')) return

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
      title: text,
      description: description && description.length <= 500 ? description : undefined,
      url,
      source: { ...source, url },
    })
  })

  if (!episodes.length) {
    const body = compact($('body').text())
    const regex = /פרק\s*(\d+)\s*-\s*שבוע\s+([^,]+),\s*יום\s+([אבגדה]'?)/g
    for (const match of body.matchAll(regex)) {
      const episode = Number(match[1])
      const day = match[3].includes("'") ? match[3] : `${match[3]}'`
      episodes.push({
        season: page.season,
        episode,
        weekName: match[2].trim(),
        hostingOrder: dayOrder[day],
        title: match[0],
        url: page.url,
        source,
      })
    }
  }

  return episodes.sort((a, b) => a.episode - b.episode)
}

async function main() {
  await mkdir(rawDir, { recursive: true })
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
  console.log(`Saved ${deduped.length} official episode records with Kan attribution`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, SourceRef } from '../lib/types'

type SeasonConfig = {
  season: number
  title: string
  entryType: 'individual' | 'couple'
}

type ParsedParticipant = {
  name: string
  age?: number
  city?: string
  relationshipStatus?: string
}

type ParsedRow = {
  hostingOrder?: number
  tableName: string
  score?: number
  placement?: number
  status?: Contestant['status']
}

type Diagnostic = {
  season: number
  title: string
  ok: boolean
  revision?: number
  entries?: number
  error?: string
}

const configUrl = new URL('../data/wikipedia-season-pages.json', import.meta.url)
const rawDir = new URL('../data/raw/wikipedia/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const normalizedFile = new URL('../data/normalized/wikipedia-contestants.json', import.meta.url)
const diagnosticFile = new URL('../data/reports/wikipedia-import.json', import.meta.url)
const API = 'https://he.wikipedia.org/w/api.php'

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripReferences(value: string) {
  return compact(value.replace(/\[[^\]]+\]/g, '').replace(/[†‡]/g, ''))
}

function slugify(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/["'״׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeName(value: string) {
  return stripReferences(value)
    .normalize('NFKC')
    .replace(/[\s'״׳"().-]+/g, '')
    .toLowerCase()
}

function coupleNameParts(value: string) {
  return stripReferences(value)
    .split(/\s+ו(?=\p{L})/u)
    .map((part) => compact(part))
    .filter(Boolean)
}

function parsePlacement(value: string) {
  const clean = stripReferences(value)
  if (/ניצח/u.test(clean)) return 1
  if (/מקום\s+ראשון/u.test(clean)) return 1
  if (/מקום\s+שני/u.test(clean)) return 2
  if (/מקום\s+שלישי/u.test(clean)) return 3
  if (/מקום\s+רביעי/u.test(clean)) return 4
  if (/מקום\s+חמישי/u.test(clean)) return 5
  return undefined
}

function parseMembers(name: string, entryType: SeasonConfig['entryType']) {
  if (entryType === 'individual') return [name]

  const parts = coupleNameParts(name)
  if (parts.length !== 2) return parts.length ? parts : [name]

  const [first, second] = parts
  const firstTokens = first.split(' ')
  const secondTokens = second.split(' ')

  // Common Wikipedia shorthand: "חיים ואצילה גרשון" means both share the surname.
  if (firstTokens.length === 1 && secondTokens.length >= 2) {
    return [`${first} ${secondTokens.at(-1)}`, second]
  }

  return parts
}

function parseParticipant(text: string): ParsedParticipant | null {
  const clean = stripReferences(text).replace(/\s*\.\s*$/, '')
  const separator = clean.match(/\s+[–—-]\s+/u)
  if (!separator || separator.index == null) return null

  const name = compact(clean.slice(0, separator.index))
  let detail = compact(clean.slice(separator.index + separator[0].length))
  if (!name) return null

  const ageMatch = detail.match(/ב[ןת]\s+(\d{1,3})/u)
  const age = ageMatch ? Number(ageMatch[1]) : undefined

  let city: string | undefined
  const cityMatch = detail.match(/,\s*מ(.+?)$/u)
  if (cityMatch) {
    city = compact(cityMatch[1].replace(/\.$/, ''))
    detail = compact(detail.slice(0, cityMatch.index))
  }

  detail = compact(detail.replace(/^ב[ןת]\s+\d{1,3}\s*,?\s*/u, '').replace(/^,\s*/, ''))
  const relationshipStatus = detail || undefined

  return { name, age, city, relationshipStatus }
}

function winnerFromIntro(text: string) {
  const clean = stripReferences(text)
  const match = clean.match(/בשבוע\s+זה\s+ניצח(?:ה|ו)?\s+(.+?)(?:\s+עם\s+(\d+(?:\.\d+)?)\s+נקודות|\.|$)/u)
  if (!match) return undefined
  return {
    name: compact(match[1]),
    score: match[2] ? Number(match[2]) : undefined,
  }
}

function matchesWinner(entryName: string, winnerName?: string) {
  if (!winnerName) return false
  const entry = normalizeName(entryName)
  const winner = normalizeName(winnerName)
  if (entry === winner || entry.startsWith(winner) || winner.startsWith(entry)) return true

  const winnerParts = coupleNameParts(winnerName).map(normalizeName)
  return winnerParts.length > 1 && winnerParts.every((part) => entry.includes(part))
}

function participantMatchesRow(participantName: string, rowName: string, entryType: SeasonConfig['entryType']) {
  const participant = normalizeName(participantName)
  const row = normalizeName(rowName)
  if (participant === row || participant.includes(row) || row.includes(participant)) return true
  if (entryType === 'individual') return false

  const rowParts = coupleNameParts(rowName).map(normalizeName)
  return rowParts.length > 1 && rowParts.every((part) => participant.includes(part))
}

function participantsForCoupleRow(participants: ParsedParticipant[], rowName: string) {
  const rowParts = coupleNameParts(rowName)
  if (rowParts.length !== 2) return []

  return rowParts.flatMap((part) => {
    const needle = normalizeName(part.split(' ')[0])
    const match = participants.find((participant) => {
      const firstToken = normalizeName(participant.name.split(' ')[0])
      return firstToken === needle || normalizeName(participant.name).startsWith(needle)
    })
    return match ? [match] : []
  })
}

function parseRows($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): ParsedRow[] {
  const rows: ParsedRow[] = []

  table.find('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return

    const orderText = stripReferences(cells.eq(0).text())
    const tableName = stripReferences(cells.eq(1).text())
    if (!tableName || /משתתף|הזוג/u.test(tableName)) return

    let hostingOrder: number | undefined
    if (/^\d+$/.test(orderText)) hostingOrder = Number(orderText)
    else if (/^[–—-]$/.test(orderText)) hostingOrder = undefined
    else return

    const last = stripReferences(cells.eq(cells.length - 1).text())
    const scoreMatch = last.match(/^(-?\d+(?:\.\d+)?)(?:\s|$)/)
    const score = scoreMatch ? Number(scoreMatch[1]) : undefined
    const placement = parsePlacement(last)
    const status: Contestant['status'] = /פרש/u.test(cells.text()) ? 'withdrawn' : 'active'

    rows.push({ hostingOrder, tableName, score, placement, status })
  })

  return rows
}

async function fetchSeason(config: SeasonConfig) {
  const url = new URL(API)
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', config.title)
  url.searchParams.set('prop', 'text|revid')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'come-dine-stats/0.4 (source-first factual metadata importer; contact via GitHub)',
    },
  })
  if (!response.ok) throw new Error(`${config.title}: ${response.status} ${response.statusText}`)

  const payload = await response.json() as {
    parse?: { title: string; pageid: number; revid: number; text: string }
    error?: { info?: string }
  }
  if (!payload.parse) throw new Error(payload.error?.info ?? `Could not parse ${config.title}`)
  return payload.parse
}

function extractSeason(config: SeasonConfig, html: string, source: SourceRef): Contestant[] {
  const $ = cheerio.load(html)
  const output: Contestant[] = []

  $('h3').each((_, heading) => {
    const headingText = stripReferences($(heading).text())
    const weekMatch = headingText.match(/שבוע\s*(\d+)\s*\(([^)]+)\)/u)
    if (!weekMatch) return

    const week = Number(weekMatch[1])
    const weekName = compact(weekMatch[2])
    const siblings: cheerio.Cheerio<any>[] = []

    // MediaWiki's current parser wraps section headings in .mw-heading. Walk
    // from that wrapper, not from the nested <h3>, so the following paragraphs,
    // lists and score table are actual siblings.
    const headingNode = $(heading).parent().hasClass('mw-heading') ? $(heading).parent() : $(heading)
    let current = headingNode.next()

    while (
      current.length &&
      !current.is('h2,h3') &&
      !current.hasClass('mw-heading2') &&
      !current.hasClass('mw-heading3')
    ) {
      siblings.push(current)
      current = current.next()
    }

    const introText = siblings
      .filter((node) => node.is('p'))
      .map((node) => stripReferences(node.text()))
      .join(' ')
    const winner = winnerFromIntro(introText)

    const list = siblings.find((node) => node.is('ul'))
    const participants = list?.length
      ? list.find('li').toArray().map((li) => parseParticipant($(li).text())).filter((item): item is ParsedParticipant => Boolean(item))
      : []

    const table = siblings.find((node) => node.is('table'))
    const rows = table?.length ? parseRows($, table) : []

    if (!rows.length && !participants.length) return

    // The scoring table is the canonical competition-entry list. Participant
    // bullet lists sometimes use a different order, and season 3 week 8 lists
    // six individual friends while the scoring table correctly has three pairs.
    const canonicalRows: ParsedRow[] = rows.length
      ? rows
      : participants.map((participant, index) => ({
          tableName: participant.name,
          hostingOrder: index + 1,
          status: 'active',
        }))

    for (const row of canonicalRows) {
      const directParticipant = participants.find((participant) => participantMatchesRow(participant.name, row.tableName, config.entryType))
      const pairedParticipants = config.entryType === 'couple' && !directParticipant
        ? participantsForCoupleRow(participants, row.tableName)
        : []

      const name = directParticipant?.name ?? row.tableName
      const members = directParticipant
        ? parseMembers(directParticipant.name, config.entryType)
        : pairedParticipants.length === 2
          ? pairedParticipants.map((participant) => participant.name)
          : parseMembers(row.tableName, config.entryType)

      const sharedCity = pairedParticipants.length === 2 && pairedParticipants[0].city === pairedParticipants[1].city
        ? pairedParticipants[0].city
        : undefined
      const city = directParticipant?.city ?? sharedCity
      const relationshipStatus = directParticipant?.relationshipStatus
      const age = config.entryType === 'individual' ? directParticipant?.age : undefined

      const isWinner = matchesWinner(name, winner?.name) || matchesWinner(row.tableName, winner?.name) || row.placement === 1
      const score = row.score ?? (isWinner ? winner?.score : undefined)
      const fieldSources: Contestant['fieldSources'] = {}
      const setSource = (field: string, value: unknown) => {
        if (value !== undefined && value !== null && value !== '') fieldSources[field] = [source]
      }

      setSource('entryType', config.entryType)
      setSource('members', members)
      setSource('week', week)
      setSource('weekName', weekName)
      setSource('hostingOrder', row.hostingOrder)
      setSource('age', age)
      setSource('city', city)
      setSource('relationshipStatus', relationshipStatus)
      setSource('score', score)
      setSource('placement', isWinner ? 1 : row.placement)
      setSource('winner', isWinner)
      setSource('status', row.status)

      output.push({
        slug: `s${config.season}-${slugify(name)}`,
        name,
        season: config.season,
        entryType: config.entryType,
        members,
        status: row.status ?? 'active',
        week,
        weekName,
        hostingOrder: row.hostingOrder,
        age,
        city,
        relationshipStatus,
        score,
        placement: isWinner ? 1 : row.placement,
        winner: isWinner,
        dishes: [],
        sources: [source],
        fieldSources,
      })
    }
  })

  return output
}

async function main() {
  await mkdir(rawDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  const configs = JSON.parse(await readFile(configUrl, 'utf8')) as SeasonConfig[]
  const all: Contestant[] = []
  const diagnostics: Diagnostic[] = []

  for (const config of configs) {
    try {
      const parsed = await fetchSeason(config)
      await writeFile(new URL(`season-${config.season}.html`, rawDir), parsed.text)

      const revisionUrl = `https://he.wikipedia.org/w/index.php?title=${encodeURIComponent(config.title.replace(/ /g, '_'))}&oldid=${parsed.revid}`
      const source: SourceRef = {
        kind: 'wikipedia',
        title: `${config.title} — ויקיפדיה העברית`,
        url: revisionUrl,
        author: 'ויקיפדיה העברית — עורכים שונים',
        license: 'CC BY-SA 4.0',
        note: `Imported from revision ${parsed.revid}; factual competition metadata with revision-level attribution`,
      }

      const contestants = extractSeason(config, parsed.text, source)
      all.push(...contestants)
      diagnostics.push({ season: config.season, title: config.title, ok: true, revision: parsed.revid, entries: contestants.length })
      console.log(`Wikipedia season ${config.season}: ${contestants.length} competition entries from revision ${parsed.revid}`)
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      diagnostics.push({ season: config.season, title: config.title, ok: false, error: message })
      console.warn(`Wikipedia season ${config.season} failed: ${message}`)
    }
  }

  const deduped = [...new Map(all.map((contestant) => [`${contestant.season}:${normalizeName(contestant.name)}`, contestant])).values()]
    .sort((a, b) => a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999))

  await writeFile(normalizedFile, JSON.stringify(deduped, null, 2))
  await writeFile(diagnosticFile, JSON.stringify({ seasons: diagnostics, totalEntries: deduped.length }, null, 2))
  console.log(`Saved ${deduped.length} Wikipedia competition entries with revision-level attribution`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, SourceRef } from '../lib/types'
import { parseWikipediaParticipant, type WikipediaParticipant } from '../lib/season10-profile-parser'

type SeasonConfig = {
  season: number
  title: string
  entryType: 'individual' | 'couple'
  expectedEntries: number
  expectedWeeks: number
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
  expectedEntries: number
  tableWeeks?: number
  expectedWeeks: number
  preservedPrevious?: boolean
  error?: string
}

type SeasonExtraction = {
  contestants: Contestant[]
  detectedWeeks: number
  tableWeeks: number
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
    .map(compact)
    .filter(Boolean)
}

function parsePlacement(value: string) {
  const clean = stripReferences(value)
  if (/ניצח|מקום\s+ראשון/u.test(clean)) return 1
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
  if (firstTokens.length === 1 && secondTokens.length >= 2) {
    return [`${first} ${secondTokens.at(-1)}`, second]
  }
  return parts
}

function winnerFromIntro(text: string) {
  const match = stripReferences(text).match(/בשבוע\s+זה\s+ניצח(?:ה|ו)?\s+(.+?)(?:\s+עם\s+(\d+(?:\.\d+)?)\s+נקודות|\.|$)/u)
  if (!match) return undefined
  return { name: compact(match[1]), score: match[2] ? Number(match[2]) : undefined }
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

function participantsForCoupleRow(participants: WikipediaParticipant[], rowName: string) {
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

function allNodeMatches($: cheerio.CheerioAPI, nodes: cheerio.Cheerio<any>[], selector: string) {
  const matches: cheerio.Cheerio<any>[] = []
  for (const node of nodes) {
    if (node.is(selector)) matches.push(node)
    node.find(selector).each((_, element) => {
      matches.push($(element))
    })
  }
  return matches
}

function parseRows($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): ParsedRow[] {
  const rows: ParsedRow[] = []
  table.find('tr').each((_, row) => {
    const cells = $(row).children('th,td')
    if (cells.length < 2) return

    const orderText = stripReferences(cells.eq(0).text())
    const tableName = stripReferences(cells.eq(1).text())
    if (!tableName || /משתתף|הזוג/u.test(tableName)) return

    let hostingOrder: number | undefined
    if (/^\d+$/.test(orderText)) hostingOrder = Number(orderText)
    else if (!/^[–—-]$/.test(orderText)) return

    const last = stripReferences(cells.eq(cells.length - 1).text())
    const scoreMatch = last.match(/^(-?\d+(?:\.\d+)?)(?:\s|$)/)
    rows.push({
      hostingOrder,
      tableName,
      score: scoreMatch ? Number(scoreMatch[1]) : undefined,
      placement: parsePlacement(last),
      status: /פרש/u.test(cells.text()) ? 'withdrawn' : 'active',
    })
  })
  return rows
}

function bestParticipantList($: cheerio.CheerioAPI, siblings: cheerio.Cheerio<any>[]) {
  let best: WikipediaParticipant[] = []
  for (const list of allNodeMatches($, siblings, 'ul')) {
    const parsed = list.find('li').toArray()
      .map((li) => parseWikipediaParticipant($(li).text()))
      .filter((item): item is WikipediaParticipant => Boolean(item))
    if (parsed.length > best.length) best = parsed
  }
  return best
}

function bestScoreRows($: cheerio.CheerioAPI, siblings: cheerio.Cheerio<any>[]) {
  let best: ParsedRow[] = []
  for (const table of allNodeMatches($, siblings, 'table')) {
    const parsed = parseRows($, table)
    if (parsed.length > best.length) best = parsed
  }
  return best
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchSeason(config: SeasonConfig) {
  const url = new URL(API)
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', config.title)
  url.searchParams.set('prop', 'text|revid')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'come-dine-stats/0.4 (source-first factual metadata importer; contact via GitHub)',
      },
    })

    if (response.ok) {
      const payload = await response.json() as {
        parse?: { title: string; pageid: number; revid: number; text: string }
        error?: { info?: string }
      }
      if (!payload.parse) throw new Error(payload.error?.info ?? `Could not parse ${config.title}`)
      return payload.parse
    }

    lastError = new Error(`${config.title}: ${response.status} ${response.statusText}`)
    if (response.status !== 429 && response.status < 500) break

    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30_000)
      : attempt * 3_000
    console.warn(`Wikipedia season ${config.season}: ${response.status}; retry ${attempt}/4 after ${delay}ms`)
    await sleep(delay)
  }

  throw lastError ?? new Error(`Could not fetch ${config.title}`)
}

function extractSeason(config: SeasonConfig, html: string, source: SourceRef): SeasonExtraction {
  const $ = cheerio.load(html)
  const output: Contestant[] = []
  let detectedWeeks = 0
  let tableWeeks = 0

  $('h3').each((_, heading) => {
    const weekMatch = stripReferences($(heading).text()).match(/שבוע\s*(\d+)\s*\(([^)]+)\)/u)
    if (!weekMatch) return
    detectedWeeks++

    const week = Number(weekMatch[1])
    const weekName = compact(weekMatch[2])
    const siblings: cheerio.Cheerio<any>[] = []
    const headingNode = $(heading).parent().hasClass('mw-heading') ? $(heading).parent() : $(heading)
    let current = headingNode.next()
    while (current.length && !current.is('h2,h3') && !current.hasClass('mw-heading2') && !current.hasClass('mw-heading3')) {
      siblings.push(current)
      current = current.next()
    }

    const introText = siblings.filter((node) => node.is('p')).map((node) => stripReferences(node.text())).join(' ')
    const winner = winnerFromIntro(introText)
    const participants = bestParticipantList($, siblings)
    const rows = bestScoreRows($, siblings)
    if (rows.length) tableWeeks++

    if (!rows.length && !participants.length) return
    if (config.entryType === 'couple' && !rows.length) {
      console.warn(`Wikipedia season ${config.season}, week ${week}: no scoring rows; skipped unsafe couple fallback`)
      return
    }

    const canonicalRows: ParsedRow[] = rows.length
      ? rows
      : participants.map((participant, index) => ({ tableName: participant.name, hostingOrder: index + 1, status: 'active' }))

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

  return { contestants: output, detectedWeeks, tableWeeks }
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(normalizedFile, 'utf8')) as Contestant[]
  } catch {
    return []
  }
}

async function main() {
  await mkdir(rawDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  const configs = JSON.parse(await readFile(configUrl, 'utf8')) as SeasonConfig[]
  const previous = await readPrevious()
  const all: Contestant[] = []
  const diagnostics: Diagnostic[] = []
  let unresolved = false

  for (const config of configs) {
    try {
      const parsed = await fetchSeason(config)
      const revisionUrl = `https://he.wikipedia.org/w/index.php?title=${encodeURIComponent(config.title.replace(/ /g, '_'))}&oldid=${parsed.revid}`
      const source: SourceRef = {
        kind: 'wikipedia',
        title: `${config.title} — ויקיפדיה העברית`,
        url: revisionUrl,
        author: 'ויקיפדיה העברית — עורכים שונים',
        license: 'CC BY-SA 4.0',
        note: `Imported from revision ${parsed.revid}; factual competition metadata with revision-level attribution`,
      }
      const extraction = extractSeason(config, parsed.text, source)
      const contestants = extraction.contestants
      if (contestants.length !== config.expectedEntries) {
        throw new Error(`quality gate: expected ${config.expectedEntries} entries, parsed ${contestants.length}`)
      }
      if (extraction.detectedWeeks !== config.expectedWeeks || extraction.tableWeeks !== config.expectedWeeks) {
        throw new Error(`quality gate: expected ${config.expectedWeeks} table-backed weeks, detected ${extraction.detectedWeeks}, score tables ${extraction.tableWeeks}`)
      }

      await writeFile(new URL(`season-${config.season}.html`, rawDir), parsed.text)
      all.push(...contestants)
      diagnostics.push({
        season: config.season,
        title: config.title,
        ok: true,
        revision: parsed.revid,
        entries: contestants.length,
        expectedEntries: config.expectedEntries,
        tableWeeks: extraction.tableWeeks,
        expectedWeeks: config.expectedWeeks,
      })
      console.log(`Wikipedia season ${config.season}: ${contestants.length}/${config.expectedEntries} entries; ${extraction.tableWeeks}/${config.expectedWeeks} score tables; revision ${parsed.revid}`)
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      const fallback = previous.filter((item) => item.season === config.season)
      if (fallback.length === config.expectedEntries) {
        all.push(...fallback)
        diagnostics.push({
          season: config.season,
          title: config.title,
          ok: false,
          entries: fallback.length,
          expectedEntries: config.expectedEntries,
          expectedWeeks: config.expectedWeeks,
          preservedPrevious: true,
          error: message,
        })
        console.warn(`Wikipedia season ${config.season}: preserved ${fallback.length} previous validated entries after ${message}`)
      } else {
        unresolved = true
        diagnostics.push({
          season: config.season,
          title: config.title,
          ok: false,
          entries: fallback.length || undefined,
          expectedEntries: config.expectedEntries,
          expectedWeeks: config.expectedWeeks,
          preservedPrevious: false,
          error: message,
        })
        console.error(`Wikipedia season ${config.season}: no validated fallback available after ${message}`)
      }
    }
    await sleep(1_500)
  }

  await writeFile(diagnosticFile, JSON.stringify({ seasons: diagnostics, totalEntries: all.length }, null, 2))
  if (unresolved) throw new Error('Wikipedia import incomplete; normalized data was not replaced')

  const deduped = [...new Map(all.map((contestant) => [`${contestant.season}:${normalizeName(contestant.name)}`, contestant])).values()]
    .sort((a, b) => a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999))
  const expectedTotal = configs.reduce((sum, config) => sum + config.expectedEntries, 0)
  if (deduped.length !== expectedTotal) throw new Error(`Wikipedia aggregate quality gate failed: expected ${expectedTotal}, got ${deduped.length}`)

  await writeFile(normalizedFile, JSON.stringify(deduped, null, 2))
  console.log(`Saved ${deduped.length} validated Wikipedia competition entries with revision-level attribution`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, SourceRef } from '../lib/types'

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

type Extraction = {
  contestants: Contestant[]
  detectedWeeks: number
  tableWeeks: number
}

const SEASON = 10
const TITLE = 'בואו לאכול איתי עונה 10'
const API = 'https://he.wikipedia.org/w/api.php'
const MIN_ENTRIES = 15
const MAX_ENTRIES = 25
const MIN_WEEKS = 3
const MAX_WEEKS = 5

const normalizedFile = new URL('../data/normalized/wikipedia-contestants.json', import.meta.url)
const rawDir = new URL('../data/raw/wikipedia/', import.meta.url)
const reportsDir = new URL('../data/reports/', import.meta.url)
const reportFile = new URL('../data/reports/wikipedia-season10-rolling.json', import.meta.url)

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

function parsePlacement(value: string) {
  const clean = stripReferences(value)
  if (/ניצח|מקום\s+ראשון/u.test(clean)) return 1
  if (/מקום\s+שני/u.test(clean)) return 2
  if (/מקום\s+שלישי/u.test(clean)) return 3
  if (/מקום\s+רביעי/u.test(clean)) return 4
  if (/מקום\s+חמישי/u.test(clean)) return 5
  return undefined
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
  return { name, age, city, relationshipStatus: detail || undefined }
}

function participantMatchesRow(participantName: string, rowName: string) {
  const participant = normalizeName(participantName)
  const row = normalizeName(rowName)
  return participant === row || participant.includes(row) || row.includes(participant)
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
  let best: ParsedParticipant[] = []
  for (const list of allNodeMatches($, siblings, 'ul')) {
    const parsed = list.find('li').toArray()
      .map((li) => parseParticipant($(li).text()))
      .filter((item): item is ParsedParticipant => Boolean(item))
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

function inferSafeWinner(rows: ParsedRow[]) {
  const explicit = rows.find((row) => row.placement === 1)
  if (explicit) return normalizeName(explicit.tableName)

  const numeric = rows.filter((row) => row.score !== undefined)
  if (!numeric.length) return undefined
  const unknown = rows.filter((row) => row.score === undefined)
  const unknownCouldStillWin = unknown.some((row) => row.placement === undefined || row.placement === 1)
  if (unknownCouldStillWin) return undefined

  const max = Math.max(...numeric.map((row) => row.score!))
  const leaders = numeric.filter((row) => row.score === max)
  return leaders.length === 1 ? normalizeName(leaders[0].tableName) : undefined
}

async function fetchSeason() {
  const url = new URL(API)
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', TITLE)
  url.searchParams.set('prop', 'text|revid')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'come-dine-stats/0.4 (rolling season importer; revision-level attribution)',
      },
    })

    if (response.ok) {
      const payload = await response.json() as {
        parse?: { revid: number; text: string }
        error?: { info?: string }
      }
      if (!payload.parse) throw new Error(payload.error?.info ?? `Could not parse ${TITLE}`)
      return payload.parse
    }

    lastError = new Error(`${TITLE}: ${response.status} ${response.statusText}`)
    if (response.status !== 429 && response.status < 500) break
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : attempt * 3_000
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  throw lastError ?? new Error(`Could not fetch ${TITLE}`)
}

function extractSeason(html: string, source: SourceRef): Extraction {
  const $ = cheerio.load(html)
  const output: Contestant[] = []
  let detectedWeeks = 0
  let tableWeeks = 0

  $('h3').each((_, heading) => {
    const weekMatch = stripReferences($(heading).text()).match(/שבוע\s*(\d+)\s*\(([^)]+)\)/u)
    if (!weekMatch) return

    const week = Number(weekMatch[1])
    if (week < 1 || week > MAX_WEEKS) return
    detectedWeeks++

    const weekName = compact(weekMatch[2])
    const siblings: cheerio.Cheerio<any>[] = []
    const headingNode = $(heading).parent().hasClass('mw-heading') ? $(heading).parent() : $(heading)
    let current = headingNode.next()
    while (current.length && !current.is('h2,h3') && !current.hasClass('mw-heading2') && !current.hasClass('mw-heading3')) {
      siblings.push(current)
      current = current.next()
    }

    const participants = bestParticipantList($, siblings)
    const rows = bestScoreRows($, siblings)
    if (rows.length) tableWeeks++
    if (!participants.length && !rows.length) return

    const winner = inferSafeWinner(rows)
    const canonical: Array<{ row: ParsedRow; participant?: ParsedParticipant }> = rows.length
      ? rows.map((row) => ({ row, participant: participants.find((item) => participantMatchesRow(item.name, row.tableName)) }))
      : participants.map((participant) => ({ row: { tableName: participant.name, status: 'active' }, participant }))

    for (const { row, participant } of canonical) {
      const name = participant?.name ?? row.tableName
      const isWinner = winner === normalizeName(row.tableName) || winner === normalizeName(name)
      const winnerValue = winner ? isWinner : undefined
      const fieldSources: Contestant['fieldSources'] = {}
      const setSource = (field: string, value: unknown) => {
        if (value !== undefined && value !== null && value !== '') fieldSources[field] = [source]
      }

      setSource('entryType', 'individual')
      setSource('members', [name])
      setSource('week', week)
      setSource('weekName', weekName)
      setSource('hostingOrder', row.hostingOrder)
      setSource('age', participant?.age)
      setSource('city', participant?.city)
      setSource('relationshipStatus', participant?.relationshipStatus)
      setSource('score', row.score)
      setSource('placement', isWinner ? 1 : row.placement)
      setSource('winner', winnerValue)
      setSource('status', row.status)

      output.push({
        slug: `s${SEASON}-${slugify(name)}`,
        name,
        season: SEASON,
        entryType: 'individual',
        members: [name],
        status: row.status ?? 'active',
        week,
        weekName,
        hostingOrder: row.hostingOrder,
        age: participant?.age,
        city: participant?.city,
        relationshipStatus: participant?.relationshipStatus,
        score: row.score,
        placement: isWinner ? 1 : row.placement,
        winner: winnerValue,
        dishes: [],
        sources: [source],
        fieldSources,
      })
    }
  })

  return { contestants: output, detectedWeeks, tableWeeks }
}

function mergePreviousFields(current: Contestant[], previous: Contestant[]) {
  const previousByName = new Map(previous.map((item) => [normalizeName(item.name), item]))
  return current.map((item) => {
    const old = previousByName.get(normalizeName(item.name))
    if (!old) return item

    const merged = { ...item } as Contestant
    const fields = ['hostingOrder', 'age', 'city', 'relationshipStatus', 'score', 'placement', 'winner'] as const
    for (const field of fields) {
      if (merged[field] === undefined && old[field] !== undefined) {
        ;(merged as any)[field] = old[field]
        if (old.fieldSources?.[field]) {
          merged.fieldSources = { ...(merged.fieldSources ?? {}), [field]: old.fieldSources[field] }
        }
      }
    }
    return merged
  })
}

function validate(extraction: Extraction, previousCount: number) {
  const entries = extraction.contestants.length
  if (entries < MIN_ENTRIES || entries > MAX_ENTRIES) {
    throw new Error(`quality gate: expected ${MIN_ENTRIES}-${MAX_ENTRIES} rolling entries, parsed ${entries}`)
  }
  if (extraction.detectedWeeks < MIN_WEEKS || extraction.detectedWeeks > MAX_WEEKS) {
    throw new Error(`quality gate: expected ${MIN_WEEKS}-${MAX_WEEKS} detected weeks, got ${extraction.detectedWeeks}`)
  }
  if (entries !== extraction.detectedWeeks * 5) {
    throw new Error(`quality gate: expected five entries per detected week, got ${entries} across ${extraction.detectedWeeks} weeks`)
  }
  if (extraction.tableWeeks < MIN_WEEKS || extraction.tableWeeks > extraction.detectedWeeks) {
    throw new Error(`quality gate: expected at least ${MIN_WEEKS} score-table weeks, got ${extraction.tableWeeks}`)
  }
  if (previousCount && entries < previousCount) {
    throw new Error(`non-regression gate: previous validated season had ${previousCount} entries, current parse has ${entries}`)
  }
}

async function main() {
  await mkdir(rawDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })

  const existing = JSON.parse(await readFile(normalizedFile, 'utf8')) as Contestant[]
  const historical = existing.filter((item) => item.season !== SEASON)
  const previous = existing.filter((item) => item.season === SEASON)

  try {
    const parsed = await fetchSeason()
    const revisionUrl = `https://he.wikipedia.org/w/index.php?title=${encodeURIComponent(TITLE.replace(/ /g, '_'))}&oldid=${parsed.revid}`
    const source: SourceRef = {
      kind: 'wikipedia',
      title: `${TITLE} — ויקיפדיה העברית`,
      url: revisionUrl,
      author: 'ויקיפדיה העברית — עורכים שונים',
      license: 'CC BY-SA 4.0',
      note: `Rolling season import from revision ${parsed.revid}; factual competition metadata with revision-level attribution`,
    }

    const extraction = extractSeason(parsed.text, source)
    validate(extraction, previous.length)
    const season10 = mergePreviousFields(extraction.contestants, previous)
    const combined = [...historical, ...season10]
      .sort((a, b) => a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999) || a.name.localeCompare(b.name, 'he'))

    await writeFile(new URL(`season-${SEASON}.html`, rawDir), parsed.text)
    await writeFile(normalizedFile, JSON.stringify(combined, null, 2))
    await writeFile(reportFile, JSON.stringify({
      season: SEASON,
      mode: 'rolling',
      ok: true,
      revision: parsed.revid,
      entries: season10.length,
      previousEntries: previous.length,
      detectedWeeks: extraction.detectedWeeks,
      tableWeeks: extraction.tableWeeks,
      maxEntries: MAX_ENTRIES,
      maxWeeks: MAX_WEEKS,
    }, null, 2))

    console.log(`Wikipedia season ${SEASON} rolling: ${season10.length}/${MAX_ENTRIES} entries; ${extraction.detectedWeeks}/${MAX_WEEKS} weeks detected; ${extraction.tableWeeks} score tables; revision ${parsed.revid}`)
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    await writeFile(reportFile, JSON.stringify({
      season: SEASON,
      mode: 'rolling',
      ok: false,
      preservedPrevious: previous.length > 0,
      entries: previous.length,
      error: message,
    }, null, 2))

    if (!previous.length) throw error
    console.warn(`Wikipedia season ${SEASON} rolling: preserved ${previous.length} previous entries after ${message}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

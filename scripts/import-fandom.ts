import { mkdir, writeFile } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import type { Contestant, Dish, DishVariant, SourceRef } from '../lib/types'

const API = 'https://comedinewithmeil.fandom.com/he/api.php'
const rawDir = new URL('../data/raw/fandom/', import.meta.url)
const normalizedFile = new URL('../data/normalized/fandom-contestants.json', import.meta.url)

const hebrewNumber: Record<string, number> = {
  הראשון: 1, הראשונה: 1, ראשון: 1, ראשונה: 1,
  השני: 2, השנייה: 2, שני: 2, שנייה: 2,
  השלישי: 3, השלישית: 3, שלישי: 3, שלישית: 3,
  הרביעי: 4, הרביעית: 4, רביעי: 4, רביעית: 4,
  החמישי: 5, החמישית: 5, חמישי: 5, חמישית: 5,
}

const ordinalWords = Object.keys(hebrewNumber).sort((a, b) => b.length - a.length).join('|')

function compact(value: string) {
  return value.replace(/\[[^\]]*]/g, '').replace(/\s+/g, ' ').trim()
}

function numberFrom(value?: string) {
  if (!value) return undefined
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

function scoreAfterDisqualification(value?: string) {
  if (!value) return undefined
  const match = value.match(/\((\d+)\s*נקודות?\s*לאחר\s*פסיל/u)
  return match ? Number(match[1]) : undefined
}

function placementFrom(value?: string) {
  const numeric = numberFrom(value)
  if (numeric) return numeric
  if (!value) return undefined
  for (const [word, number] of Object.entries(hebrewNumber)) {
    if (value.includes(word)) return number
  }
  return undefined
}

function hostingOrderFromText(value: string) {
  const patterns = [
    new RegExp(`אירח[ה]?[^.!?]{0,80}?(${ordinalWords})`),
    new RegExp(`(?:היה|הייתה)[^.!?]{0,50}?(?:מארח|מארחת)[^.!?]{0,40}?(${ordinalWords})`),
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) return hebrewNumber[match[1]]
  }
  return undefined
}

function weekFromEpisodes(value?: string) {
  if (!value) return undefined
  const range = value.match(/פרקים?\s*(\d+)\s*[-–]\s*(\d+)/)
  if (!range) return undefined
  return Math.floor((Number(range[1]) - 1) / 5) + 1
}

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function mediaWiki(params: Record<string, string>) {
  const url = new URL(API)
  Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([k, v]) => url.searchParams.set(k, v))
  const response = await fetch(url, { headers: { 'user-agent': 'come-dine-stats/0.4 (attribution-preserving research importer)' } })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json()
}

const seasonCategoryNames = [
  'הראשונה', 'השנייה', 'השלישית', 'הרביעית', 'החמישית',
  'השישית', 'השביעית', 'השמינית', 'התשיעית', 'העשירית',
]

async function categoryMembers(category: string) {
  const members: string[] = []
  let cmcontinue: string | undefined
  do {
    const json = await mediaWiki({
      action: 'query', list: 'categorymembers',
      cmtitle: `קטגוריה:${category}`, cmnamespace: '0', cmlimit: 'max',
      ...(cmcontinue ? { cmcontinue } : {}),
    })
    for (const member of json.query?.categorymembers ?? []) members.push(member.title)
    cmcontinue = json.continue?.cmcontinue
  } while (cmcontinue)
  return members
}

async function getContestantTitles() {
  const titles = new Set<string>()
  const coverage: Record<string, number> = {}

  for (const ordinal of seasonCategoryNames) {
    const category = `מתמודדים בעונה ${ordinal}`
    const members = await categoryMembers(category)
    coverage[category] = members.length
    members.forEach((title) => titles.add(title))
  }

  const winners = await categoryMembers('מנצחים')
  coverage['מנצחים'] = winners.length
  winners.forEach((title) => titles.add(title))

  await writeFile(new URL('coverage.json', rawDir), JSON.stringify({
    categories: coverage,
    uniqueContestantPages: titles.size,
  }, null, 2))

  return [...titles]
}

function headingMatches(actual: string, requested: string) {
  const text = compact(actual)
  return text === requested || text.startsWith(`${requested} (`)
}

function valueAfterHeading($: cheerio.CheerioAPI, headingText: string) {
  const heading = $('h2,h3,h4').filter((_, el) => headingMatches($(el).text(), headingText)).first()
  if (!heading.length) return undefined
  let node = heading.next()
  while (node.length && !/^H[234]$/.test(node[0]?.tagName?.toUpperCase?.() ?? '')) {
    const text = compact(node.text())
    if (text) return text
    node = node.next()
  }
  return undefined
}

function sourceFor(url: string): SourceRef {
  return {
    kind: 'fandom',
    title: 'בואו לאכול איתי Wiki — Fandom',
    url,
    license: 'CC BY-SA 3.0 (unless otherwise noted by the wiki)',
    note: 'Direct article link preserved for attribution',
  }
}

function courseFromLabel(label: string): Dish['course'] | null {
  if (/מנה ראשונה/.test(label)) return 'starter'
  if (/מנה עיקרית/.test(label)) return 'main'
  if (/קינוח/.test(label)) return 'dessert'
  return null
}

function variantFromLabel(label: string): DishVariant {
  if (/טבעוני/.test(label)) return 'vegan'
  if (/צמחוני/.test(label)) return 'vegetarian'
  if (/חלופ|תחליפ/.test(label)) return 'alternative'
  return 'standard'
}

function extractDishes($: cheerio.CheerioAPI, source: SourceRef): Dish[] {
  const dishes: Dish[] = []
  const seen = new Set<string>()

  $('h4').each((_, element) => {
    const label = compact($(element).text())
    const course = courseFromLabel(label)
    if (!course) return
    const value = valueAfterHeading($, label)
    if (!value) return

    const variant = variantFromLabel(label)
    const [name, ...rest] = value.split(/\s+-\s+/)
    const dish: Dish = {
      course,
      variant,
      label,
      name: compact(name),
      description: compact(rest.join(' - ')) || undefined,
      tags: variant === 'standard' ? undefined : [label],
      sources: [source],
    }
    const key = `${dish.course}:${dish.variant}:${dish.name.normalize('NFKC').toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    dishes.push(dish)
  })

  return dishes
}

function evidenceFor(source: SourceRef, values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key]) => [key, [source]]))
}

function normalizedCategories(categories: string[]) {
  return categories.map((category) => category.replace(/_/g, ' ').normalize('NFKC').replace(/\s+/g, ' ').trim())
}

function parseContestant(title: string, html: string, categories: string[], url: string): Contestant | null {
  const $ = cheerio.load(html)
  const episodes = valueAfterHeading($, 'פרקים')
  const season = numberFrom(episodes?.match(/עונה\s+\d+/)?.[0])
  if (!season) return null
  const weekName = episodes?.match(/\(שבוע\s+(.+?)\)/)?.[1]
  const scoreText = valueAfterHeading($, 'ניקוד')
  const originalScore = numberFrom(scoreText)
  const categoryNames = normalizedCategories(categories)
  const disqualified = categoryNames.includes('מתמודדים שנפסלו מהתחרות')
  const adjustedScore = disqualified ? scoreAfterDisqualification(scoreText) : undefined
  const sourcedPlacement = placementFrom(valueAfterHeading($, 'דירוג בשבוע'))
  const bodyText = compact($.root().text())
  const source = sourceFor(url)
  const values = {
    status: disqualified ? 'disqualified' as const : undefined,
    week: weekFromEpisodes(episodes),
    weekName,
    hostingOrder: hostingOrderFromText(bodyText),
    age: numberFrom(valueAfterHeading($, 'גיל')),
    city: valueAfterHeading($, 'מקום מגורים'),
    occupation: valueAfterHeading($, 'מקצוע'),
    relationshipStatus: valueAfterHeading($, 'מצב משפחתי'),
    score: disqualified ? (adjustedScore ?? originalScore) : originalScore,
    scoreBeforeAdjustment: disqualified && adjustedScore != null && originalScore !== adjustedScore ? originalScore : undefined,
    placement: disqualified ? undefined : sourcedPlacement,
    winner: disqualified ? false : sourcedPlacement === 1 || categoryNames.includes('מנצחים'),
  }
  const dishes = extractDishes($, source)

  return {
    slug: `${season}-${slugify(title)}`,
    name: title,
    season,
    ...values,
    dishes,
    sources: [source],
    fieldSources: evidenceFor(source, { name: title, season, ...values, dishes: dishes.length ? true : undefined }),
  }
}

async function main() {
  await mkdir(rawDir, { recursive: true })
  const titles = await getContestantTitles()
  const output: Contestant[] = []
  for (const [index, title] of titles.entries()) {
    const json = await mediaWiki({ action: 'parse', page: title, prop: 'text|categories' })
    const html = json.parse?.text ?? ''
    const categories = (json.parse?.categories ?? []).map((c: { category: string }) => c.category)
    const url = `https://comedinewithmeil.fandom.com/he/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
    await writeFile(new URL(`${slugify(title)}.json`, rawDir), JSON.stringify({ title, categories, html, url }, null, 2))
    const contestant = parseContestant(title, html, categories, url)
    if (contestant) output.push(contestant)
    if ((index + 1) % 25 === 0) console.log(`Parsed ${index + 1}/${titles.length} Fandom pages`)
  }
  await writeFile(normalizedFile, JSON.stringify(output, null, 2))
  console.log(`Imported ${output.length} contestant pages from ${titles.length} candidate pages with direct attribution URLs`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

export type WikipediaParticipant = {
  name: string
  age?: number
  city?: string
  relationshipStatus?: string
}

export type Season10Participant = WikipediaParticipant

const RELATIONSHIP_STATUS_PATTERN = /(?:נשוי|נשואה|נשואים|נשואות|גרוש|גרושה|גרושים|גרושות|אלמן|אלמנה|אלמנים|אלמנות|רווק|רווקה|רווקים|רווקות|פרוד|פרודה|פרודים|פרודות|בזוגיות|בהורות משותפת|הורות משותפת)/u

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripReferences(value: string) {
  return compact(value.replace(/\[[^\]]+\]/g, '').replace(/[†‡]/g, ''))
}

export function hasExplicitRelationshipStatus(value: string) {
  return RELATIONSHIP_STATUS_PATTERN.test(value)
}

function isValidCityPrefix(value: string) {
  const prefix = compact(value.replace(/[\s,]+$/u, ''))
  return !prefix || /^\+\d+$/u.test(prefix) || hasExplicitRelationshipStatus(prefix)
}

function splitTrailingCity(value: string) {
  const markerPattern = /(?:^|[\s,])מ(?=\S)/gu
  for (const match of value.matchAll(markerPattern)) {
    if (match.index == null) continue
    const separatorLength = match[0].length - 1
    const markerIndex = match.index + separatorLength
    const prefix = compact(value.slice(0, match.index).replace(/[\s,]+$/u, ''))
    if (!isValidCityPrefix(prefix)) continue

    const city = compact(value.slice(markerIndex + 1).replace(/[.,]\s*$/, ''))
    if (!city) continue
    return { prefix, city }
  }
  return { prefix: value, city: undefined }
}

export function parseWikipediaParticipant(text: string): WikipediaParticipant | null {
  const clean = stripReferences(text).replace(/\s*\.\s*$/, '')
  const separator = clean.match(/\s+[–—-]\s+/u)
  if (!separator || separator.index == null) return null

  const name = compact(clean.slice(0, separator.index))
  let detail = compact(clean.slice(separator.index + separator[0].length))
  if (!name) return null

  const ageMatch = detail.match(/ב[ןת]\s+(\d{1,3})/u)
  const age = ageMatch ? Number(ageMatch[1]) : undefined

  detail = compact(detail.replace(/^ב[ןת]\s+\d{1,3}\s*,?\s*/u, '').replace(/^,\s*/, ''))
  const citySplit = splitTrailingCity(detail)
  const city = citySplit.city
  detail = compact(citySplit.prefix.replace(/^,\s*/, '').replace(/,\s*$/, ''))

  const relationshipStatus = detail && hasExplicitRelationshipStatus(detail) ? detail : undefined
  return { name, age, city, relationshipStatus }
}

export const parseSeason10Participant = parseWikipediaParticipant

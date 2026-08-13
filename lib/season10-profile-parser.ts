export type Season10Participant = {
  name: string
  age?: number
  city?: string
  relationshipStatus?: string
}

const RELATIONSHIP_STATUS_PATTERN = /(?:נשוי|נשואה|גרוש|גרושה|אלמן|אלמנה|רווק|רווקה|פרוד|פרודה|בזוגיות)/u

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripReferences(value: string) {
  return compact(value.replace(/\[[^\]]+\]/g, '').replace(/[†‡]/g, ''))
}

export function hasExplicitRelationshipStatus(value: string) {
  return RELATIONSHIP_STATUS_PATTERN.test(value)
}

export function parseSeason10Participant(text: string): Season10Participant | null {
  const clean = stripReferences(text).replace(/\s*\.\s*$/, '')
  const separator = clean.match(/\s+[–—-]\s+/u)
  if (!separator || separator.index == null) return null

  const name = compact(clean.slice(0, separator.index))
  let detail = compact(clean.slice(separator.index + separator[0].length))
  if (!name) return null

  const ageMatch = detail.match(/ב[ןת]\s+(\d{1,3})/u)
  const age = ageMatch ? Number(ageMatch[1]) : undefined

  let city: string | undefined
  const cityMatch = detail.match(/(?:^|[\s,])מ(\S(?:.*\S)?)$/u)
  if (cityMatch && cityMatch.index != null) {
    city = compact(cityMatch[1].replace(/[.,]\s*$/, ''))
    detail = compact(detail.slice(0, cityMatch.index).replace(/[\s,]+$/u, ''))
  }

  detail = compact(
    detail
      .replace(/^ב[ןת]\s+\d{1,3}\s*,?\s*/u, '')
      .replace(/^,\s*/, '')
      .replace(/,\s*$/, ''),
  )

  const relationshipStatus = detail && hasExplicitRelationshipStatus(detail) ? detail : undefined
  return { name, age, city, relationshipStatus }
}

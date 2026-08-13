import assert from 'node:assert/strict'
import { parseSeason10Participant } from '../lib/season10-profile-parser'

const cases = [
  ['רועי גולן – בן 44, +4, ממלחה.', { name: 'רועי גולן', age: 44, city: 'מלחה' }],
  ['אדם גוזלן – בן 28, גרוש +1 מנווה דניאל.', { name: 'אדם גוזלן', age: 28, city: 'נווה דניאל', relationshipStatus: 'גרוש +1' }],
  ['יגאל טמיר – בן 79 נשוי פעם שנייה משורש.', { name: 'יגאל טמיר', age: 79, city: 'שורש', relationshipStatus: 'נשוי פעם שנייה' }],
  ['חיה לב – בת 52 מנחלאות.', { name: 'חיה לב', age: 52, city: 'נחלאות' }],
  ['ניקול אלטשולר – בת 26, מעין כרם.', { name: 'ניקול אלטשולר', age: 26, city: 'עין כרם' }],
  ['איריס אלוג – בת 53, נשואה +2, מראשון לציון.', { name: 'איריס אלוג', age: 53, city: 'ראשון לציון', relationshipStatus: 'נשואה +2' }],
  ['יריב אגוזי – בן 55, גרוש +3 מנס ציונה.', { name: 'יריב אגוזי', age: 55, city: 'נס ציונה', relationshipStatus: 'גרוש +3' }],
  ['ליהי קימורה – בת 35, נשואה ממזכרת בתיה.', { name: 'ליהי קימורה', age: 35, city: 'מזכרת בתיה', relationshipStatus: 'נשואה' }],
  ['זהר גורמס – בת 30, נשואה +2 מרחובות.', { name: 'זהר גורמס', age: 30, city: 'רחובות', relationshipStatus: 'נשואה +2' }],
  ['דניאל דריי – בן 61, נשוי +4 מגנות.', { name: 'דניאל דריי', age: 61, city: 'גנות', relationshipStatus: 'נשוי +4' }],
  ['עליזה אלקיים עבאדי – אלמנה, מקריית ים.', { name: 'עליזה אלקיים עבאדי', city: 'קריית ים', relationshipStatus: 'אלמנה' }],
  ['רוני פליישר – בת 50, +1 מכרמיאל.', { name: 'רוני פליישר', age: 50, city: 'כרמיאל' }],
  ['אבינעם שמעון – מכליל.', { name: 'אבינעם שמעון', city: 'כליל' }],
  ['מירן הולדשטיין – נשואה מחיפה.', { name: 'מירן הולדשטיין', city: 'חיפה', relationshipStatus: 'נשואה' }],
  ['אלירן בוחבוט – נשוי +1 מקריית אתא.', { name: 'אלירן בוחבוט', city: 'קריית אתא', relationshipStatus: 'נשוי +1' }],
] as const

for (const [input, expected] of cases) {
  assert.deepEqual(parseSeason10Participant(input), expected, input)
}

console.log(`Season 10 profile parser: ${cases.length} regression cases passed`)

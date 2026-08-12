import assert from 'node:assert/strict'
import { contestants } from '../lib/data'
import { contestantFromRouteSlug, displayWeekName } from '../lib/presentation'

const unicodeEntry = contestants.find((entry) => /[^\x00-\x7F]/.test(entry.slug))
assert(unicodeEntry, 'expected at least one contestant with a non-ASCII slug')

const encoded = encodeURIComponent(unicodeEntry.slug)
assert.equal(
  contestantFromRouteSlug(contestants, encoded)?.slug,
  unicodeEntry.slug,
  'percent-encoded Hebrew contestant slugs must resolve to the source record',
)

assert.equal(
  contestantFromRouteSlug(contestants, unicodeEntry.slug)?.slug,
  unicodeEntry.slug,
  'decoded contestant slugs must continue to resolve',
)

assert.equal(displayWeekName('שמנים'), '״שמנים״ — כינוי ב־Fandom')
assert.equal(displayWeekName('תל אביב'), 'תל אביב')

console.log(`Route regression OK: ${unicodeEntry.slug} resolves encoded and decoded.`)

import { mkdir, writeFile } from 'node:fs/promises'

const CDX = 'https://web.archive.org/cdx/search/cdx'
const AVAILABLE = 'https://archive.org/wayback/available'
const REPLAY = 'https://web.archive.org/web/'
const outDir = new URL('../data/raw/legacy/', import.meta.url)

type Capture = {
  timestamp: string
  original: string
  mimetype?: string
  statuscode?: string
  digest?: string
  archivedUrl?: string
  discovery: 'cdx' | 'availability'
}

type Target = {
  name: 'contestants' | 'weeks'
  wildcard: string
  exact: string[]
}

const targets: Target[] = [
  {
    name: 'contestants',
    wildcard: 'protected-shore-74105.herokuapp.com/contestants*',
    exact: [
      'https://protected-shore-74105.herokuapp.com/contestants?_limit=-1',
      'http://protected-shore-74105.herokuapp.com/contestants?_limit=-1',
      'https://protected-shore-74105.herokuapp.com/contestants',
      'http://protected-shore-74105.herokuapp.com/contestants',
    ],
  },
  {
    name: 'weeks',
    wildcard: 'protected-shore-74105.herokuapp.com/weeks*',
    exact: [
      'https://protected-shore-74105.herokuapp.com/weeks?_limit=-1',
      'http://protected-shore-74105.herokuapp.com/weeks?_limit=-1',
      'https://protected-shore-74105.herokuapp.com/weeks',
      'http://protected-shore-74105.herokuapp.com/weeks',
    ],
  },
]

const availabilityTimestamps = [
  '20210101', '20210401', '20210701', '20211001',
  '20220101', '20220401', '20220701', '20221001', '20230101',
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchText(url: string, attempts = 4) {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json,text/plain,*/*',
          'user-agent': 'come-dine-stats/0.3 (+historical data recovery; attribution preserved)',
        },
      })
      if (response.ok) return response.text()
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === attempts) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`)
      }
      lastError = new Error(`${url}: ${response.status} ${response.statusText}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }
    await sleep(750 * attempt * attempt)
  }
  throw lastError
}

async function cdx(pattern: string): Promise<Capture[]> {
  const url = new URL(CDX)
  url.searchParams.set('url', pattern)
  url.searchParams.set('output', 'json')
  url.searchParams.set('filter', 'statuscode:200')
  url.searchParams.set('fl', 'timestamp,original,mimetype,statuscode,digest')
  url.searchParams.set('collapse', 'digest')
  url.searchParams.set('from', '2020')
  url.searchParams.set('to', '2023')

  try {
    const json = JSON.parse(await fetchText(url.toString())) as string[][]
    if (!Array.isArray(json) || json.length < 2) return []
    const [header, ...rows] = json
    return rows.map((row) => ({
      ...(Object.fromEntries(header.map((key, index) => [key, row[index]])) as Omit<Capture, 'discovery'>),
      discovery: 'cdx' as const,
    }))
  } catch (error) {
    console.warn(`CDX unavailable for ${pattern}:`, error instanceof Error ? error.message : error)
    return []
  }
}

function parseArray(text: string) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function idReplayUrl(capture: Capture) {
  if (capture.archivedUrl) {
    const normalized = capture.archivedUrl.replace(/^http:/, 'https:')
    return normalized.replace(/\/web\/(\d+)(?:[a-z_]+)?\//, '/web/$1id_/')
  }
  return `${REPLAY}${capture.timestamp}id_/${capture.original}`
}

async function availabilityCaptures(originals: string[]): Promise<Capture[]> {
  const captures = new Map<string, Capture>()
  for (const original of originals) {
    for (const timestamp of availabilityTimestamps) {
      const url = new URL(AVAILABLE)
      url.searchParams.set('url', original)
      url.searchParams.set('timestamp', timestamp)
      try {
        const payload = JSON.parse(await fetchText(url.toString(), 3)) as {
          archived_snapshots?: { closest?: { available?: boolean; status?: string; timestamp?: string; url?: string } }
        }
        const closest = payload.archived_snapshots?.closest
        if (!closest?.available || closest.status !== '200' || !closest.timestamp || !closest.url) continue
        const capture: Capture = {
          timestamp: closest.timestamp,
          original,
          statuscode: closest.status,
          archivedUrl: closest.url,
          discovery: 'availability',
        }
        captures.set(`${capture.timestamp}:${capture.original}`, capture)
      } catch (error) {
        console.warn(`Availability lookup failed for ${original} @ ${timestamp}:`, error instanceof Error ? error.message : error)
      }
    }
  }
  return [...captures.values()]
}

async function recover(target: Target) {
  const cdxCaptures = await cdx(target.wildcard)
  const fallbackCaptures = cdxCaptures.length ? [] : await availabilityCaptures(target.exact)
  const captures = [...cdxCaptures, ...fallbackCaptures]
  const candidates: Array<{ capture: Capture; data: unknown[]; snapshotUrl: string }> = []

  for (const capture of captures) {
    const snapshotUrl = idReplayUrl(capture)
    try {
      const data = parseArray(await fetchText(snapshotUrl, 3))
      if (data) candidates.push({ capture, data, snapshotUrl })
    } catch (error) {
      console.warn(`Skipping unreadable capture ${snapshotUrl}:`, error instanceof Error ? error.message : error)
    }
  }

  candidates.sort((a, b) => b.data.length - a.data.length || b.capture.timestamp.localeCompare(a.capture.timestamp))
  return { captures, best: candidates[0], candidates }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const manifest: Record<string, unknown> = {
    recoveredAt: new Date().toISOString(),
    archive: 'Internet Archive / Wayback Machine',
    originalService: 'https://protected-shore-74105.herokuapp.com/',
    frontendCredit: 'https://github.com/nemo369/dine-with-me',
    targets: {},
  }

  for (const target of targets) {
    console.log(`Searching Wayback for ${target.wildcard}`)
    const result = await recover(target)
    ;(manifest.targets as Record<string, unknown>)[target.name] = {
      captureCount: result.captures.length,
      discoveryMethods: [...new Set(result.captures.map((capture) => capture.discovery))],
      best: result.best ? {
        timestamp: result.best.capture.timestamp,
        originalUrl: result.best.capture.original,
        snapshotUrl: result.best.snapshotUrl,
        rows: result.best.data.length,
        discovery: result.best.capture.discovery,
      } : null,
    }

    if (result.best) {
      await writeFile(new URL(`${target.name}.json`, outDir), JSON.stringify(result.best.data, null, 2))
      await writeFile(new URL(`${target.name}.source.json`, outDir), JSON.stringify({
        kind: 'wayback',
        title: `Archived legacy ${target.name} API`,
        originalUrl: result.best.capture.original,
        snapshotUrl: result.best.snapshotUrl,
        timestamp: result.best.capture.timestamp,
        rows: result.best.data.length,
        discovery: result.best.capture.discovery,
        originalProject: 'https://github.com/nemo369/dine-with-me',
      }, null, 2))
      console.log(`Recovered ${result.best.data.length} ${target.name} rows via ${result.best.capture.discovery} from ${result.best.capture.timestamp}`)
    } else {
      console.warn(`No JSON-array Wayback capture recovered for ${target.name}`)
    }
  }

  await writeFile(new URL('wayback-manifest.json', outDir), JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import { mkdir, writeFile } from 'node:fs/promises'

const CDX = 'https://web.archive.org/cdx/search/cdx'
const REPLAY = 'https://web.archive.org/web/'
const outDir = new URL('../data/raw/legacy/', import.meta.url)

type CdxRow = {
  timestamp: string
  original: string
  mimetype: string
  statuscode: string
  digest: string
}

const targets = [
  'protected-shore-74105.herokuapp.com/contestants*',
  'protected-shore-74105.herokuapp.com/weeks*',
]

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'come-dine-stats/0.2 (+historical data recovery; attribution preserved)',
    },
  })
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

async function cdx(pattern: string): Promise<CdxRow[]> {
  const url = new URL(CDX)
  url.searchParams.set('url', pattern)
  url.searchParams.set('output', 'json')
  url.searchParams.set('filter', 'statuscode:200')
  url.searchParams.set('fl', 'timestamp,original,mimetype,statuscode,digest')
  url.searchParams.set('collapse', 'digest')
  url.searchParams.set('from', '2020')
  url.searchParams.set('to', '2023')

  const json = JSON.parse(await fetchText(url.toString())) as string[][]
  if (!Array.isArray(json) || json.length < 2) return []
  const [header, ...rows] = json
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])) as CdxRow)
}

function parseArray(text: string) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function recover(pattern: string) {
  const captures = await cdx(pattern)
  const candidates: Array<{ capture: CdxRow; data: unknown[]; snapshotUrl: string }> = []

  for (const capture of captures) {
    const snapshotUrl = `${REPLAY}${capture.timestamp}id_/${capture.original}`
    try {
      const data = parseArray(await fetchText(snapshotUrl))
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

  for (const pattern of targets) {
    const name = pattern.includes('/contestants') ? 'contestants' : 'weeks'
    console.log(`Searching Wayback for ${pattern}`)
    const result = await recover(pattern)
    ;(manifest.targets as Record<string, unknown>)[name] = {
      captureCount: result.captures.length,
      best: result.best ? {
        timestamp: result.best.capture.timestamp,
        originalUrl: result.best.capture.original,
        snapshotUrl: result.best.snapshotUrl,
        rows: result.best.data.length,
      } : null,
    }
    if (result.best) {
      await writeFile(new URL(`${name}.json`, outDir), JSON.stringify(result.best.data, null, 2))
      await writeFile(new URL(`${name}.source.json`, outDir), JSON.stringify({
        kind: 'wayback',
        title: `Archived legacy ${name} API`,
        originalUrl: result.best.capture.original,
        snapshotUrl: result.best.snapshotUrl,
        timestamp: result.best.capture.timestamp,
        rows: result.best.data.length,
        originalProject: 'https://github.com/nemo369/dine-with-me',
      }, null, 2))
      console.log(`Recovered ${result.best.data.length} ${name} rows from ${result.best.capture.timestamp}`)
    } else {
      console.warn(`No JSON array capture recovered for ${name}`)
    }
  }

  await writeFile(new URL('wayback-manifest.json', outDir), JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = process.env.LEGACY_API_ENDPOINT ?? 'https://protected-shore-74105.herokuapp.com/'
const outDir = new URL('../data/raw/legacy/', import.meta.url)

async function fetchJson(path: string) {
  const url = new URL(path, endpoint)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response.json()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const [contestants, weeks] = await Promise.all([
    fetchJson('contestants?_limit=-1'),
    fetchJson('weeks?_limit=-1'),
  ])
  await writeFile(new URL('contestants.json', outDir), JSON.stringify(contestants, null, 2))
  await writeFile(new URL('weeks.json', outDir), JSON.stringify(weeks, null, 2))
  console.log(`Saved ${contestants.length} legacy rows and ${weeks.length} weeks`)
}

main().catch((error) => {
  console.error('Legacy API import failed. Next fallback: Wayback snapshot recovery.')
  console.error(error)
  process.exitCode = 1
})

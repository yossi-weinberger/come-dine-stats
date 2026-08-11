import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Contestant, SourceRef } from '../lib/types'

const inputFile = new URL('../data/supplemental/profiles.json', import.meta.url)
const outputFile = new URL('../data/normalized/supplemental-profile-contestants.json', import.meta.url)

const sourceSchema = z.object({
  kind: z.literal('manual'),
  url: z.string().url(),
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
})

const fieldsSchema = z.object({
  age: z.number().int().min(18).max(120).optional(),
  city: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  occupation: z.string().min(1).optional(),
  relationshipStatus: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  diet: z.string().min(1).optional(),
}).refine((fields) => Object.values(fields).some((value) => value != null && value !== ''), {
  message: 'At least one verified profile field is required',
})

const rowSchema = z.object({
  season: z.number().int().positive(),
  name: z.string().min(1),
  source: sourceSchema,
  fields: fieldsSchema,
})

const fileSchema = z.array(rowSchema)

type ProfileField = keyof z.infer<typeof fieldsSchema>

function slugify(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/["'״׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  const raw = JSON.parse(await readFile(inputFile, 'utf8'))
  const rows = fileSchema.parse(raw)
  const seen = new Set<string>()

  const output: Contestant[] = rows.map((row) => {
    const source: SourceRef = row.source
    const key = `${row.season}:${row.name.normalize('NFKC').toLowerCase()}:${source.url}`
    if (seen.has(key)) throw new Error(`Duplicate supplemental profile row: ${key}`)
    seen.add(key)

    const fieldSources: Record<string, SourceRef[]> = {}
    for (const [field, value] of Object.entries(row.fields) as Array<[ProfileField, unknown]>) {
      if (value != null && value !== '') fieldSources[field] = [source]
    }

    return {
      slug: `s${row.season}-${slugify(row.name)}`,
      name: row.name,
      season: row.season,
      ...row.fields,
      dishes: [],
      sources: [source],
      fieldSources,
    }
  })

  await writeFile(outputFile, JSON.stringify(output, null, 2))
  console.log(`Imported ${output.length} supplemental profile evidence rows`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

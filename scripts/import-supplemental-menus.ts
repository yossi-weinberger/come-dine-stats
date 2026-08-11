import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Contestant, Dish, SourceRef } from '../lib/types'

const inputFile = new URL('../data/supplemental/menus.json', import.meta.url)
const outputFile = new URL('../data/normalized/supplemental-menu-contestants.json', import.meta.url)

const sourceSchema = z.object({
  kind: z.enum(['foodik', 'rest']),
  url: z.string().url(),
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
})

const dishSchema = z.object({
  course: z.enum(['starter', 'main', 'dessert']),
  variant: z.enum(['standard', 'vegetarian', 'vegan', 'alternative']).default('standard'),
  label: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
})

const rowSchema = z.object({
  season: z.number().int().positive(),
  name: z.string().min(1),
  source: sourceSchema,
  dishes: z.array(dishSchema).min(1),
})

const fileSchema = z.array(rowSchema)

function slugify(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/["'״׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function dishKey(season: number, name: string, dish: z.infer<typeof dishSchema>) {
  return [
    season,
    name.normalize('NFKC').toLowerCase(),
    dish.course,
    dish.variant,
    dish.name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(),
  ].join(':')
}

async function main() {
  const raw = JSON.parse(await readFile(inputFile, 'utf8'))
  const rows = fileSchema.parse(raw)
  const seen = new Set<string>()

  const output: Contestant[] = rows.map((row) => {
    const source: SourceRef = row.source
    const dishes: Dish[] = row.dishes.map((dish) => {
      const key = dishKey(row.season, row.name, dish)
      if (seen.has(key)) throw new Error(`Duplicate supplemental dish: ${key}`)
      seen.add(key)
      return {
        ...dish,
        sources: [source],
      }
    })

    return {
      slug: `s${row.season}-${slugify(row.name)}`,
      name: row.name,
      season: row.season,
      dishes,
      sources: [source],
      fieldSources: { dishes: [source] },
    }
  })

  await writeFile(outputFile, JSON.stringify(output, null, 2))
  console.log(`Imported ${output.length} supplemental menus with ${output.flatMap((row) => row.dishes).length} sourced dishes`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

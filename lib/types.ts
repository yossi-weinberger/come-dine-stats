export type SourceKind = 'legacy' | 'fandom' | 'wikipedia' | 'kan' | 'manual' | 'wayback'

export type SourceRef = {
  kind: SourceKind
  url: string
  title?: string
  author?: string
  license?: string
  retrievedAt?: string
  note?: string
}

export type DishCourse = 'starter' | 'main' | 'dessert'
export type DishVariant = 'standard' | 'vegetarian' | 'vegan' | 'alternative'

export type Dish = {
  course: DishCourse
  variant?: DishVariant
  label?: string
  name: string
  description?: string
  tags?: string[]
  sources?: SourceRef[]
}

export type Contestant = {
  slug: string
  name: string
  season: number
  entryType?: 'individual' | 'couple'
  members?: string[]
  status?: 'active' | 'withdrawn' | 'guest'
  week?: number
  weekName?: string
  hostingOrder?: number
  age?: number
  city?: string
  region?: string
  occupation?: string
  relationshipStatus?: string
  gender?: string
  diet?: string
  score?: number
  placement?: number
  winner?: boolean
  dishes: Dish[]
  episodeUrls?: string[]
  sources: SourceRef[]
  fieldSources?: Record<string, SourceRef[]>
}

export type SourceRegistryEntry = {
  id: SourceKind
  name: string
  role: string
  url: string
  attribution: string
  license?: string
  licenseUrl?: string
  reusePolicy: string
}

export type Episode = {
  season: number
  episode: number
  weekName?: string
  hostingOrder?: number
  title: string
  description?: string
  url: string
  source: SourceRef
}

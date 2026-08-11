import type { Metadata } from 'next'
import Link from 'next/link'
import { contestants } from '@/lib/data'
import type { Contestant, Dish } from '@/lib/types'
import { SiteFooter } from '@/components/site-footer'
import styles from './explore.module.css'

export const metadata: Metadata = {
  title: 'חיפוש מתקדם — בואו לאכול איתי הדאטאבייס',
  description: 'חיפוש וסינון בכל העונות לפי שם, מנה, עיר, גיל, ציון, מקום, זכייה ותפריט.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>
type SortKey = 'season' | 'score-desc' | 'score-asc' | 'age-desc' | 'age-asc' | 'hosting' | 'placement'

const primaryCourses = ['starter', 'main', 'dessert'] as const

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function numberParam(value: string | string[] | undefined) {
  const raw = one(value)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').replace(/\s+/g, ' ').trim()
}

function searchableText(entry: Contestant) {
  return normalize([
    entry.name,
    ...(entry.members ?? []),
    entry.city,
    entry.region,
    entry.occupation,
    entry.relationshipStatus,
    entry.weekName,
    ...entry.dishes.flatMap((dish) => [dish.name, dish.description, dish.label, ...(dish.tags ?? [])]),
  ].filter(Boolean).join(' '))
}

function variantOf(dish: Dish) {
  return dish.variant ?? 'standard'
}

function hasCompletePrimaryMenu(entry: Contestant) {
  const courses = new Set(
    entry.dishes
      .filter((dish) => variantOf(dish) === 'standard')
      .map((dish) => dish.course),
  )
  return primaryCourses.every((course) => courses.has(course))
}

function compareOptionalNumber(a: number | undefined, b: number | undefined, direction: 'asc' | 'desc') {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return direction === 'asc' ? a - b : b - a
}

function sortEntries(entries: Contestant[], sort: SortKey) {
  return [...entries].sort((a, b) => {
    switch (sort) {
      case 'score-desc': return compareOptionalNumber(a.score, b.score, 'desc') || a.name.localeCompare(b.name, 'he')
      case 'score-asc': return compareOptionalNumber(a.score, b.score, 'asc') || a.name.localeCompare(b.name, 'he')
      case 'age-desc': return compareOptionalNumber(a.age, b.age, 'desc') || a.name.localeCompare(b.name, 'he')
      case 'age-asc': return compareOptionalNumber(a.age, b.age, 'asc') || a.name.localeCompare(b.name, 'he')
      case 'hosting': return compareOptionalNumber(a.hostingOrder, b.hostingOrder, 'asc') || a.season - b.season || a.name.localeCompare(b.name, 'he')
      case 'placement': return compareOptionalNumber(a.placement, b.placement, 'asc') || a.season - b.season || a.name.localeCompare(b.name, 'he')
      default: return a.season - b.season || (a.week ?? 999) - (b.week ?? 999) || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999) || a.name.localeCompare(b.name, 'he')
    }
  })
}

function dishPreview(entry: Contestant) {
  const primary = entry.dishes.filter((dish) => variantOf(dish) === 'standard' && primaryCourses.includes(dish.course as typeof primaryCourses[number]))
  const source = primary.length ? primary : entry.dishes
  return source.slice(0, 3)
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const query = one(params.q)
  const season = numberParam(params.season)
  const winner = one(params.winner)
  const placement = numberParam(params.placement)
  const minScore = numberParam(params.minScore)
  const maxScore = numberParam(params.maxScore)
  const minAge = numberParam(params.minAge)
  const maxAge = numberParam(params.maxAge)
  const city = one(params.city)
  const menu = one(params.menu)
  const requestedSort = one(params.sort)
  const sort: SortKey = ['season', 'score-desc', 'score-asc', 'age-desc', 'age-asc', 'hosting', 'placement'].includes(requestedSort)
    ? requestedSort as SortKey
    : 'season'
  const needle = normalize(query)

  const filtered = sortEntries(contestants.filter((entry) => {
    if (needle && !searchableText(entry).includes(needle)) return false
    if (season != null && entry.season !== season) return false
    if (winner === 'yes' && !entry.winner) return false
    if (winner === 'no' && entry.winner) return false
    if (placement != null && entry.placement !== placement) return false
    if (minScore != null && (entry.score == null || entry.score < minScore)) return false
    if (maxScore != null && (entry.score == null || entry.score > maxScore)) return false
    if (minAge != null && (entry.age == null || entry.age < minAge)) return false
    if (maxAge != null && (entry.age == null || entry.age > maxAge)) return false
    if (city && entry.city !== city) return false
    if (menu === 'any' && entry.dishes.length === 0) return false
    if (menu === 'complete' && !hasCompletePrimaryMenu(entry)) return false
    if (menu === 'none' && entry.dishes.length !== 0) return false
    return true
  }), sort)

  const seasons = [...new Set(contestants.map((entry) => entry.season))].sort((a, b) => a - b)
  const cities = [...new Set(contestants.flatMap((entry) => entry.city ? [entry.city] : []))].sort((a, b) => a.localeCompare(b, 'he'))
  const activeFilterCount = [query, season, winner, placement, minScore, maxScore, minAge, maxAge, city, menu]
    .filter((value) => value !== undefined && value !== '').length

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <div className="heroLinks">
            <Link className="creditsLink" href="/stats">סטטיסטיקות →</Link>
            <Link className="creditsLink" href="/sources">מקורות →</Link>
          </div>
        </div>
        <div className="eyebrow">Explorer · 289 יחידות תחרות</div>
        <h1>לחתוך את המאגר<br/><em>איך שבא לכם</em></h1>
        <p>חיפוש אחד על שמות, ערים, מקצועות ומנות — עם פילטרים שנשמרים בכתובת, כך שאפשר לשלוח בדיוק את אותה תוצאה למישהו אחר.</p>
      </section>

      <section className={styles.filterPanel} aria-label="סינון המאגר">
        <form className={styles.filters} action="/explore" method="get">
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>חיפוש חופשי</span>
            <input type="search" name="q" defaultValue={query} placeholder="שם, עיר, מקצוע, קובה, טירמיסו…" />
          </label>

          <label className={styles.field}>
            <span>עונה</span>
            <select name="season" defaultValue={season ?? ''}>
              <option value="">כל העונות</option>
              {seasons.map((value) => <option key={value} value={value}>עונה {value}</option>)}
            </select>
          </label>

          <label className={styles.field}>
            <span>זכייה</span>
            <select name="winner" defaultValue={winner}>
              <option value="">הכול</option>
              <option value="yes">🏆 זוכים בלבד</option>
              <option value="no">ללא זוכים</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>מקום</span>
            <select name="placement" defaultValue={placement ?? ''}>
              <option value="">כל המקומות</option>
              {[1,2,3,4,5].map((value) => <option key={value} value={value}>מקום {value}</option>)}
            </select>
          </label>

          <label className={styles.field}>
            <span>עיר</span>
            <select name="city" defaultValue={city}>
              <option value="">כל הערים</option>
              {cities.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <div className={styles.rangeGroup}>
            <span className={styles.rangeLabel}>ציון</span>
            <input aria-label="ציון מינימלי" type="number" name="minScore" defaultValue={minScore ?? ''} placeholder="מ־" min="0" />
            <input aria-label="ציון מקסימלי" type="number" name="maxScore" defaultValue={maxScore ?? ''} placeholder="עד" min="0" />
          </div>

          <div className={styles.rangeGroup}>
            <span className={styles.rangeLabel}>גיל</span>
            <input aria-label="גיל מינימלי" type="number" name="minAge" defaultValue={minAge ?? ''} placeholder="מ־" min="18" />
            <input aria-label="גיל מקסימלי" type="number" name="maxAge" defaultValue={maxAge ?? ''} placeholder="עד" min="18" />
          </div>

          <label className={styles.field}>
            <span>תפריט</span>
            <select name="menu" defaultValue={menu}>
              <option value="">הכול</option>
              <option value="any">יש לפחות מנה</option>
              <option value="complete">3 מנות עיקריות מתועדות</option>
              <option value="none">אין עדיין מנות</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>מיון</span>
            <select name="sort" defaultValue={sort}>
              <option value="season">עונה ושבוע</option>
              <option value="score-desc">ציון — גבוה לנמוך</option>
              <option value="score-asc">ציון — נמוך לגבוה</option>
              <option value="age-desc">גיל — מבוגר לצעיר</option>
              <option value="age-asc">גיל — צעיר למבוגר</option>
              <option value="hosting">סדר אירוח</option>
              <option value="placement">מקום</option>
            </select>
          </label>

          <div className={styles.actions}>
            <button className={styles.apply} type="submit">הצג</button>
            <Link className={styles.reset} href="/explore">איפוס</Link>
          </div>
        </form>
      </section>

      <section aria-labelledby="explore-results-title">
        <div className={styles.resultHeader}>
          <div>
            <div className="eyebrow">תוצאות</div>
            <h2 id="explore-results-title">{filtered.length} התאמות</h2>
          </div>
          <div>
            <strong>{activeFilterCount ? `${activeFilterCount} מסננים פעילים` : 'כל המאגר'}</strong>
            <small>מתוך {contestants.length} יחידות תחרות</small>
          </div>
        </div>

        {filtered.length ? (
          <div className={styles.grid}>
            {filtered.map((entry) => {
              const preview = dishPreview(entry)
              return (
                <Link className={styles.card} href={`/contestants/${entry.slug}`} key={entry.slug}>
                  <div className={styles.cardTop}>
                    <span>עונה {entry.season}{entry.week ? ` · שבוע ${entry.week}` : ''}{entry.weekName ? ` · ${entry.weekName}` : ''}</span>
                    {entry.winner ? <b>🏆 זוכה</b> : entry.status === 'disqualified' ? <b>נפסל/ה</b> : null}
                  </div>
                  <h3>{entry.name}</h3>
                  <div className={styles.meta}>
                    {entry.score != null && <span>{entry.score} נק׳</span>}
                    {entry.placement != null && <span>מקום {entry.placement}</span>}
                    {entry.age != null && <span>גיל {entry.age}</span>}
                    {entry.city && <span>{entry.city}</span>}
                    {entry.occupation && <span>{entry.occupation}</span>}
                  </div>
                  {preview.length > 0 && (
                    <div className={styles.dishes}>
                      {preview.map((dish) => (
                        <span key={`${dish.course}-${dish.name}`}><strong>{dish.name}</strong>{dish.course === 'other' ? ' · מנה מתועדת' : ''}</span>
                      ))}
                    </div>
                  )}
                  <span className={styles.cardFooter}>לפרופיל ולמקורות ←</span>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <div>
              <strong>אין התאמות למסננים האלה.</strong>
              <span>אפשר להרחיב את הטווחים או <Link href="/explore">לאפס את החיפוש</Link>.</span>
            </div>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  )
}

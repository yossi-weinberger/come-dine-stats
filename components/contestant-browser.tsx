'use client'

import { useMemo, useState } from 'react'
import type { Contestant, Dish, SourceRef } from '@/lib/types'

const sourceLabels: Record<string, string> = {
  fandom: 'Fandom Wiki',
  wikipedia: 'ויקיפדיה',
  kan: 'כאן 11',
  foodik: 'Foodik',
  rest: 'REST',
  legacy: 'עונת הסטטיסטיקות',
  wayback: 'Wayback',
  manual: 'מקור מאומת',
}

const hostingOrderLabels: Record<number, string> = {
  1: 'אירח ראשון',
  2: 'אירח שני',
  3: 'אירח שלישי',
  4: 'אירח רביעי',
  5: 'אירח חמישי',
}

const courseLabels: Record<string, string> = {
  starter: 'ראשונה',
  main: 'עיקרית',
  dessert: 'קינוח',
  other: 'מנה מתועדת',
}

const variantLabels: Record<string, string> = {
  vegetarian: 'צמחונית',
  vegan: 'טבעונית',
  alternative: 'חלופית',
}

function SourceLink({ source }: { source: SourceRef }) {
  return (
    <a
      className={`sourceBadge source-${source.kind}`}
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.note || source.title || sourceLabels[source.kind]}
    >
      <span aria-hidden="true">↗</span>
      {sourceLabels[source.kind] || source.kind}
    </a>
  )
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').trim()
}

function variantOf(dish: Dish) {
  const rawCourse = (dish as unknown as { course: string }).course
  if (dish.variant) return dish.variant
  return rawCourse === 'alternative' ? 'alternative' : 'standard'
}

function isPrimaryDish(dish: Dish) {
  return variantOf(dish) === 'standard' && ['starter', 'main', 'dessert'].includes(dish.course)
}

function searchableText(contestant: Contestant) {
  return normalize([
    contestant.name,
    ...(contestant.members ?? []),
    contestant.city,
    contestant.occupation,
    contestant.weekName,
    ...contestant.dishes.flatMap((dish) => [dish.name, dish.description, dish.label, ...(dish.tags ?? [])]),
  ].filter(Boolean).join(' '))
}

function entryLabel(contestant: Contestant) {
  if (contestant.entryType === 'couple') return 'זוג'
  return 'יחיד/ה'
}

function DishLine({ dish }: { dish: Dish }) {
  const variant = variantOf(dish)
  const baseLabel = dish.course === 'other'
    ? dish.label || courseLabels[dish.course]
    : courseLabels[dish.course] || dish.label
  const label = dish.course === 'other' || variant === 'standard'
    ? baseLabel
    : [baseLabel, variantLabels[variant]].filter(Boolean).join(' · ')

  return (
    <li>
      {label && <span className="dishType">{label}</span>}
      <strong>{dish.name}</strong>
      {dish.description && <small>{dish.description}</small>}
    </li>
  )
}

export function ContestantBrowser({ contestants }: { contestants: Contestant[] }) {
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState('all')
  const [winnersOnly, setWinnersOnly] = useState(false)
  const seasons = useMemo(
    () => [...new Set(contestants.map((contestant) => contestant.season))].sort((a, b) => a - b),
    [contestants],
  )

  const filtered = useMemo(() => {
    const needle = normalize(query)
    return contestants.filter((contestant) => {
      if (season !== 'all' && contestant.season !== Number(season)) return false
      if (winnersOnly && !contestant.winner) return false
      if (needle && !searchableText(contestant).includes(needle)) return false
      return true
    })
  }, [contestants, query, season, winnersOnly])

  const hasFilters = Boolean(query.trim()) || season !== 'all' || winnersOnly

  function resetFilters() {
    setQuery('')
    setSeason('all')
    setWinnersOnly(false)
  }

  return (
    <section className="section browserSection" aria-labelledby="contestants-title">
      <div className="sectionTitle">
        <div>
          <div className="eyebrow">המאגר החי</div>
          <h2 id="contestants-title">כל יחידות התחרות</h2>
        </div>
        <span className="resultCount" aria-live="polite" aria-atomic="true">
          {filtered.length} מתוך {contestants.length} רשומות
        </span>
      </div>

      <div className="browserControls" role="search">
        <label className="searchField">
          <span>חיפוש</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם, עיר, מקצוע או מנה…"
          />
        </label>

        <label className="selectField">
          <span>עונה</span>
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            <option value="all">כל העונות</option>
            {seasons.map((seasonNumber) => (
              <option key={seasonNumber} value={seasonNumber}>עונה {seasonNumber}</option>
            ))}
          </select>
        </label>

        <label className="winnerToggle">
          <input
            type="checkbox"
            checked={winnersOnly}
            onChange={(event) => setWinnersOnly(event.target.checked)}
          />
          <span>🏆 מנצחים בלבד</span>
        </label>

        <button
          className="resetFilters"
          type="button"
          onClick={resetFilters}
          disabled={!hasFilters}
        >
          איפוס
        </button>
      </div>

      {filtered.length ? (
        <div className="cards contestantGrid">
          {filtered.map((contestant) => {
            const sources = [...new Map(contestant.sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
            const primaryDishes = contestant.dishes.filter(isPrimaryDish)
            const otherDishes = contestant.dishes.filter((dish) => dish.course === 'other')
            const alternativeDishes = contestant.dishes.filter((dish) => dish.course !== 'other' && !isPrimaryDish(dish))
            return (
              <article className="card contestantCard" key={contestant.slug}>
                <div className="cardTop">
                  <span>
                    עונה {contestant.season}
                    {contestant.week ? ` · שבוע ${contestant.week}` : ''}
                    {contestant.weekName ? ` · ${contestant.weekName}` : ''}
                    {contestant.entryType ? ` · ${entryLabel(contestant)}` : ''}
                  </span>
                  {contestant.winner && <b>🏆 מקום ראשון</b>}
                </div>

                <h3>{contestant.name}</h3>
                <div className="meta">
                  {[contestant.age ? `גיל ${contestant.age}` : null, contestant.city, contestant.score != null ? `${contestant.score} נק׳` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>

                <div className="factsRow">
                  {contestant.occupation && <span>{contestant.occupation}</span>}
                  {contestant.hostingOrder && <span>{hostingOrderLabels[contestant.hostingOrder] || `סדר אירוח ${contestant.hostingOrder}`}</span>}
                  {contestant.placement && <span>מקום {contestant.placement}</span>}
                  {contestant.status === 'withdrawn' && <span>פרש/ה מהתחרות</span>}
                </div>

                {primaryDishes.length > 0 && (
                  <ol className="dishList">
                    {primaryDishes.map((dish) => (
                      <DishLine key={`${dish.course}-${variantOf(dish)}-${dish.name}`} dish={dish} />
                    ))}
                  </ol>
                )}

                {alternativeDishes.length > 0 && (
                  <details className="alternativeMenu">
                    <summary>חלופות בתפריט ({alternativeDishes.length})</summary>
                    <ol className="dishList alternativeDishList">
                      {alternativeDishes.map((dish) => (
                        <DishLine key={`${dish.course}-${variantOf(dish)}-${dish.name}`} dish={dish} />
                      ))}
                    </ol>
                  </details>
                )}

                {otherDishes.length > 0 && (
                  <details className="alternativeMenu">
                    <summary>מנות נוספות מתועדות ({otherDishes.length})</summary>
                    <ol className="dishList alternativeDishList">
                      {otherDishes.map((dish) => (
                        <DishLine key={`${dish.course}-${variantOf(dish)}-${dish.name}`} dish={dish} />
                      ))}
                    </ol>
                  </details>
                )}

                <div className="sourceRow" aria-label={`מקורות עבור ${contestant.name}`}>
                  <span>מקורות:</span>
                  {sources.map((source) => <SourceLink key={`${source.kind}-${source.url}`} source={source} />)}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="emptyState">
          <strong>לא מצאתי התאמה.</strong>
          <span>אפשר לנסות שם אחר, מנה אחרת או להסיר סינון.</span>
          {hasFilters && <button type="button" onClick={resetFilters}>איפוס סינונים</button>}
        </div>
      )}
    </section>
  )
}

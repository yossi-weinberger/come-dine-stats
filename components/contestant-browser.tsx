'use client'

import { useMemo, useState } from 'react'
import type { Contestant, SourceRef } from '@/lib/types'

const sourceLabels: Record<string, string> = {
  fandom: 'Fandom Wiki',
  kan: 'כאן 11',
  legacy: 'עונת הסטטיסטיקות',
  wayback: 'Wayback',
  manual: 'מקור מאומת',
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
      {source.title || sourceLabels[source.kind] || source.kind}
    </a>
  )
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').trim()
}

function searchableText(contestant: Contestant) {
  return normalize([
    contestant.name,
    contestant.city,
    contestant.occupation,
    contestant.weekName,
    ...contestant.dishes.flatMap((dish) => [dish.name, dish.description, ...(dish.tags ?? [])]),
  ].filter(Boolean).join(' '))
}

export function ContestantBrowser({ contestants }: { contestants: Contestant[] }) {
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState<'all' | '1' | '2'>('all')
  const [winnersOnly, setWinnersOnly] = useState(false)

  const filtered = useMemo(() => {
    const needle = normalize(query)
    return contestants.filter((contestant) => {
      if (season !== 'all' && contestant.season !== Number(season)) return false
      if (winnersOnly && !contestant.winner) return false
      if (needle && !searchableText(contestant).includes(needle)) return false
      return true
    })
  }, [contestants, query, season, winnersOnly])

  return (
    <section className="section browserSection" aria-labelledby="contestants-title">
      <div className="sectionTitle">
        <div>
          <div className="eyebrow">המאגר החי</div>
          <h2 id="contestants-title">כל המתמודדים</h2>
        </div>
        <span>{filtered.length} מתוך {contestants.length} מתמודדים</span>
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
          <select value={season} onChange={(event) => setSeason(event.target.value as 'all' | '1' | '2')}>
            <option value="all">כל העונות</option>
            <option value="1">עונה 1</option>
            <option value="2">עונה 2</option>
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
      </div>

      {filtered.length ? (
        <div className="cards contestantGrid">
          {filtered.map((contestant) => {
            const sources = [...new Map(contestant.sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
            const primaryDishes = contestant.dishes.filter((dish) => dish.course !== 'alternative')
            return (
              <article className="card contestantCard" key={contestant.slug}>
                <div className="cardTop">
                  <span>
                    עונה {contestant.season}
                    {contestant.week ? ` · שבוע ${contestant.week}` : ''}
                    {contestant.weekName ? ` · ${contestant.weekName}` : ''}
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
                  {contestant.hostingOrder && <span>אירוח #{contestant.hostingOrder}</span>}
                  {contestant.placement && <span>מקום {contestant.placement}</span>}
                </div>

                {primaryDishes.length > 0 && (
                  <ol className="dishList">
                    {primaryDishes.map((dish) => (
                      <li key={`${dish.course}-${dish.name}`}>
                        <strong>{dish.name}</strong>
                        {dish.description && <small>{dish.description}</small>}
                      </li>
                    ))}
                  </ol>
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
        </div>
      )}
    </section>
  )
}

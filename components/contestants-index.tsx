'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import styles from '@/app/contestants/contestants.module.css'

export type ContestantsIndexEntry = {
  slug: string
  name: string
  season: number
  week?: number
  weekName?: string
  hostingOrder?: number
  entryType?: 'individual' | 'couple'
  members?: string[]
  winner?: boolean
  age?: number
  city?: string
  occupation?: string
  score?: number
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('he').replace(/\s+/g, ' ').trim()
}

function searchableText(entry: ContestantsIndexEntry) {
  return normalize([
    entry.name,
    ...(entry.members ?? []),
    entry.city,
    entry.occupation,
    entry.weekName,
  ].filter(Boolean).join(' '))
}

function sortEntries(a: ContestantsIndexEntry, b: ContestantsIndexEntry) {
  return (a.week ?? 999) - (b.week ?? 999)
    || (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999)
    || a.name.localeCompare(b.name, 'he')
}

export function ContestantsIndex({ entries }: { entries: ContestantsIndexEntry[] }) {
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState<number | 'all'>('all')
  const seasons = useMemo(
    () => [...new Set(entries.map((entry) => entry.season))].sort((a, b) => b - a),
    [entries],
  )

  const filtered = useMemo(() => {
    const needle = normalize(query)
    return entries.filter((entry) => {
      if (season !== 'all' && entry.season !== season) return false
      if (needle && !searchableText(entry).includes(needle)) return false
      return true
    })
  }, [entries, query, season])

  const grouped = useMemo(() => {
    return [...new Set(filtered.map((entry) => entry.season))]
      .sort((a, b) => b - a)
      .map((seasonNumber) => ({
        season: seasonNumber,
        entries: filtered.filter((entry) => entry.season === seasonNumber).sort(sortEntries),
      }))
  }, [filtered])

  const hasFilters = query.trim() !== '' || season !== 'all'

  function reset() {
    setQuery('')
    setSeason('all')
  }

  return (
    <>
      <section className={styles.controls} aria-label="חיפוש וסינון משתתפים">
        <label className={styles.searchField}>
          <span>חיפוש מהיר</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם, עיר או מקצוע…"
          />
        </label>

        <div className={styles.seasonFilter} aria-label="סינון לפי עונה">
          <span>עונה</span>
          <div>
            <button type="button" className={season === 'all' ? styles.activeSeason : undefined} aria-pressed={season === 'all'} onClick={() => setSeason('all')}>הכול</button>
            {seasons.map((seasonNumber) => (
              <button
                type="button"
                key={seasonNumber}
                className={season === seasonNumber ? styles.activeSeason : undefined}
                aria-pressed={season === seasonNumber}
                onClick={() => setSeason(seasonNumber)}
              >
                {seasonNumber}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.resultLine} aria-live="polite">
          <span>{filtered.length} פרופילים</span>
          {hasFilters ? <button type="button" onClick={reset}>איפוס</button> : null}
        </div>
      </section>

      {grouped.length ? (
        <div className={styles.seasonGroups}>
          {grouped.map((group) => (
            <section className={styles.seasonGroup} key={group.season} aria-labelledby={`contestants-season-${group.season}`}>
              <header className={styles.seasonHeading}>
                <div>
                  <span>עונה</span>
                  <h2 id={`contestants-season-${group.season}`}>{group.season}</h2>
                </div>
                <Link href={`/seasons/${group.season}`}>{group.entries.length} פרופילים · לדף העונה ←</Link>
              </header>

              <div className={styles.entryGrid}>
                {group.entries.map((entry) => {
                  const meta = [
                    entry.age != null ? `גיל ${entry.age}` : null,
                    entry.city,
                    entry.score != null ? `${entry.score} נק׳` : null,
                  ].filter(Boolean)

                  return (
                    <Link
                      href={`/contestants/${entry.slug}`}
                      className={`${styles.entry} ${entry.winner ? styles.winner : ''}`}
                      key={entry.slug}
                    >
                      <div className={styles.entryMain}>
                        <div className={styles.entryTitle}>
                          <strong>{entry.name}</strong>
                          {entry.winner ? <span title="זוכה/ת" aria-label="זוכה/ת">🏆</span> : null}
                        </div>
                        <small>
                          {entry.week ? `שבוע ${entry.week}` : 'שבוע לא מתועד'}
                          {entry.weekName ? ` · ${entry.weekName}` : ''}
                          {entry.entryType === 'couple' ? ' · זוג' : ''}
                        </small>
                        {entry.occupation ? <p>{entry.occupation}</p> : null}
                      </div>

                      <div className={styles.entryFacts}>
                        {meta.map((fact) => <span key={fact}>{fact}</span>)}
                      </div>

                      <span className={styles.arrow} aria-hidden="true">←</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>לא מצאתי משתתף מתאים.</strong>
          <span>אפשר לנסות שם, עיר או מקצוע אחר.</span>
          <button type="button" onClick={reset}>איפוס החיפוש</button>
        </div>
      )}
    </>
  )
}

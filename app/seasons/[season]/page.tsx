import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SourceBadge } from '@/components/source-badge'
import { SiteFooter } from '@/components/site-footer'
import { competitionEntries, competitionStatusLabel, knownScores } from '@/lib/competition'
import { contestants } from '@/lib/data'
import type { Contestant, Dish, SourceRef } from '@/lib/types'

type PageProps = { params: Promise<{ season: string }> }

const courseLabels: Record<string, string> = {
  starter: 'ראשונה',
  main: 'עיקרית',
  dessert: 'קינוח',
  other: 'מנה מתועדת',
}

function participantCount(entry: Contestant) {
  return entry.members?.length || 1
}

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null
}

function variantOf(dish: Dish) {
  return dish.variant ?? 'standard'
}

function primaryDishes(entry: Contestant) {
  return entry.dishes.filter(
    (dish) => variantOf(dish) === 'standard' && ['starter', 'main', 'dessert'].includes(dish.course),
  )
}

function uniqueSources(entries: Contestant[]) {
  const sources = entries.flatMap((entry) => entry.sources)
  return [...new Map(sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
}

function entryTypeLabel(entry: Contestant) {
  return entry.entryType === 'couple' ? 'זוג' : 'יחיד/ה'
}

function scoreLabel(entry: Contestant) {
  if (entry.status === 'disqualified') {
    if (entry.score != null) return `${entry.score} נק׳ לאחר פסילה`
    return 'הציון בוטל עקב פסילה'
  }
  return entry.score != null ? `${entry.score} נק׳` : 'ציון לא מתועד'
}

function weekLabel(entries: Contestant[], week: number | undefined) {
  const name = entries.find((entry) => entry.weekName)?.weekName
  if (week != null && name) return `שבוע ${week} · ${name}`
  if (week != null) return `שבוע ${week}`
  return name || 'שבוע ללא מספר'
}

function sourceSummary(sources: SourceRef[]) {
  return [...new Set(sources.map((source) => source.kind))].length
}

const seasons = [...new Set(contestants.map((entry) => entry.season))].sort((a, b) => a - b)

export function generateStaticParams() {
  return seasons.map((season) => ({ season: String(season) }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { season: rawSeason } = await params
  const season = Number(rawSeason)
  if (!seasons.includes(season)) return {}

  return {
    title: `עונה ${season} — בואו לאכול איתי הדאטאבייס`,
    description: `מתמודדים, שבועות, ציונים, מנצחים ומנות מעונה ${season} של בואו לאכול איתי.`,
  }
}

export default async function SeasonPage({ params }: PageProps) {
  const { season: rawSeason } = await params
  const season = Number(rawSeason)
  if (!Number.isInteger(season) || !seasons.includes(season)) notFound()

  const entries = contestants
    .filter((entry) => entry.season === season)
    .sort(
      (a, b) =>
        (a.week ?? 999) - (b.week ?? 999) ||
        (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999) ||
        a.name.localeCompare(b.name, 'he'),
    )

  const activeEntries = competitionEntries(entries)
  const scores = knownScores(entries)
  const winners = activeEntries.filter((entry) => entry.winner)
  const dishes = entries.reduce((sum, entry) => sum + entry.dishes.length, 0)
  const participants = entries.reduce((sum, entry) => sum + participantCount(entry), 0)
  const exceptionalCount = entries.length - activeEntries.length
  const weekNumbers = [...new Set(entries.map((entry) => entry.week).filter((week): week is number => week != null))].sort((a, b) => a - b)
  const sources = uniqueSources(entries)

  const groupedWeeks = new Map<number | undefined, Contestant[]>()
  for (const entry of entries) {
    const key = entry.week
    groupedWeeks.set(key, [...(groupedWeeks.get(key) ?? []), entry])
  }
  const weeks = [...groupedWeeks.entries()].sort(([a], [b]) => (a ?? 999) - (b ?? 999))

  const previousSeason = seasons.filter((item) => item < season).at(-1)
  const nextSeason = seasons.find((item) => item > season)

  return (
    <main className="seasonPage">
      <header className="seasonHero">
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>

        <div className="seasonHeroCopy">
          <div className="eyebrow">עונה {season} · {entries.length} יחידות תחרות</div>
          <h1>עונה <em>{season}</em></h1>
          <p>
            {participants} משתתפים, {weekNumbers.length || weeks.length} שבועות מתועדים ו-{winners.length} זוכים / זוגות זוכים.
            כל הנתונים בדף מגיעים מאותו מאגר source-first של האתר.
            {exceptionalCount ? ` ${exceptionalCount} רשומות חריגות נשארות מוצגות אך מוחרגות מממוצעי התחרות.` : ''}
          </p>
        </div>

        <nav className="seasonPills" aria-label="מעבר בין עונות">
          {seasons.map((item) => (
            <Link key={item} className={item === season ? 'active' : ''} href={`/seasons/${item}`}>
              {item}
            </Link>
          ))}
        </nav>
      </header>

      <section className="seasonStats" aria-label={`סטטיסטיקות עונה ${season}`}>
        <div><span>משתתפים</span><strong>{participants}</strong></div>
        <div><span>יחידות תחרות</span><strong>{entries.length}</strong></div>
        <div><span>שבועות</span><strong>{weekNumbers.length || weeks.length}</strong></div>
        <div><span>ממוצע ציון תחרותי</span><strong>{average(scores) ?? '—'}</strong></div>
        <div><span>ציון שיא</span><strong>{scores.length ? Math.max(...scores) : '—'}</strong></div>
        <div><span>מנות מתועדות</span><strong>{dishes}</strong></div>
      </section>

      <section className="seasonOverview" aria-labelledby="weeks-title">
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">השבועות</div>
            <h2 id="weeks-title">כך נראתה העונה</h2>
          </div>
          <span>{scores.length}/{activeEntries.length} רשומות תחרות פעילות עם ציון</span>
        </div>

        <div className="weekIndex">
          {weeks.map(([week, weekEntries]) => {
            const activeWeekEntries = competitionEntries(weekEntries)
            const weekScores = knownScores(weekEntries)
            const weekWinners = activeWeekEntries.filter((entry) => entry.winner)
            const exceptional = weekEntries.length - activeWeekEntries.length
            return (
              <a key={week ?? 'unknown'} href={`#week-${week ?? 'unknown'}`}>
                <span>{weekLabel(weekEntries, week)}</span>
                <strong>{weekWinners.length ? `🏆 ${weekWinners.map((entry) => entry.name).join(', ')}` : 'ללא זוכה מתועד'}</strong>
                <small>{activeWeekEntries.length} יחידות פעילות · ממוצע {average(weekScores) ?? '—'}{exceptional ? ` · ${exceptional} חריגות` : ''}</small>
              </a>
            )
          })}
        </div>
      </section>

      <div className="seasonWeeks">
        {weeks.map(([week, weekEntries]) => {
          const activeWeekEntries = competitionEntries(weekEntries)
          const weekWinners = activeWeekEntries.filter((entry) => entry.winner)
          const weekScores = knownScores(weekEntries)

          return (
            <section className="weekSection" id={`week-${week ?? 'unknown'}`} key={week ?? 'unknown'}>
              <div className="weekHeader">
                <div>
                  <div className="eyebrow">{weekLabel(weekEntries, week)}</div>
                  <h2>{weekWinners.length ? `המנצח: ${weekWinners.map((entry) => entry.name).join(', ')}` : 'תוצאות השבוע'}</h2>
                </div>
                <div className="weekScoreSummary">
                  <span>ממוצע תחרותי</span>
                  <strong>{average(weekScores) ?? '—'}</strong>
                </div>
              </div>

              <div className="seasonEntries">
                {weekEntries.map((entry) => {
                  const menu = primaryDishes(entry)
                  const status = competitionStatusLabel(entry)
                  const entrySources = [...new Map(entry.sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
                  return (
                    <article className={`seasonEntry ${entry.winner ? 'winner' : ''}`} key={entry.slug}>
                      <div className="seasonEntryOrder">
                        <span>{entry.hostingOrder ? `יום ${entry.hostingOrder}` : '—'}</span>
                        {entry.winner && <b>🏆</b>}
                      </div>

                      <div className="seasonEntryBody">
                        <div className="seasonEntryTitle">
                          <div>
                            <h3>
                              <Link className="contestantNameLink" href={`/contestants/${entry.slug}`}>
                                {entry.name}
                              </Link>
                            </h3>
                            <p>
                              {[entryTypeLabel(entry), status, entry.city, entry.age ? `גיל ${entry.age}` : null, entry.occupation]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="seasonEntryScore">
                            <strong>{scoreLabel(entry)}</strong>
                            {entry.status === 'disqualified' && entry.scoreBeforeAdjustment != null && <span>{entry.scoreBeforeAdjustment} נק׳ לפני הביטול</span>}
                            {entry.placement && <span>מקום {entry.placement}</span>}
                          </div>
                        </div>

                        {menu.length > 0 ? (
                          <ul className="seasonMenu">
                            {menu.map((dish) => (
                              <li key={`${dish.course}-${dish.name}`}>
                                <span>{courseLabels[dish.course] ?? dish.course}</span>
                                <strong>{dish.name}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="seasonMenuMissing">אין עדיין תפריט מלא מתועד לרשומה הזו.</p>
                        )}

                        <Link className="profileLink" href={`/contestants/${entry.slug}`}>
                          לפרופיל המלא והמקורות ←
                        </Link>

                        <div className="sourceRow seasonSourceRow" aria-label={`מקורות עבור ${entry.name}`}>
                          <span>מקורות:</span>
                          {entrySources.map((source) => (
                            <SourceBadge key={`${source.kind}:${source.url}`} source={source} />
                          ))}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section className="seasonSources" aria-label="מקורות העונה">
        <div>
          <div className="eyebrow">provenance</div>
          <h2>מקורות ששימשו בעונה</h2>
          <p>{sources.length} קישורי מקור ישירים, מ-{sourceSummary(sources)} סוגי מקורות.</p>
        </div>
        <div className="seasonSourceBadges">
          {sources.slice(0, 12).map((source) => (
            <SourceBadge key={`${source.kind}:${source.url}`} source={source} />
          ))}
          {sources.length > 12 && <span className="moreSources">+{sources.length - 12} נוספים</span>}
        </div>
      </section>

      <nav className="seasonPager" aria-label="עונה קודמת והבאה">
        {previousSeason ? <Link href={`/seasons/${previousSeason}`}>← עונה {previousSeason}</Link> : <span />}
        {nextSeason ? <Link href={`/seasons/${nextSeason}`}>עונה {nextSeason} →</Link> : <span />}
      </nav>

      <SiteFooter />
    </main>
  )
}

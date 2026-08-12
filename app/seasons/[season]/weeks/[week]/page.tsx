import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/site-footer'
import { SourceBadge } from '@/components/source-badge'
import { competitionStatusLabel } from '@/lib/competition'
import { contestants } from '@/lib/data'
import { groupCompetitionWeeks } from '@/lib/stats-engine'
import type { Contestant, Dish, SourceRef } from '@/lib/types'
import styles from './week.module.css'

type PageProps = {
  params: Promise<{ season: string; week: string }>
}

const courseLabels: Record<Dish['course'], string> = {
  starter: 'מנה ראשונה',
  main: 'מנה עיקרית',
  dessert: 'קינוח',
  other: 'מנה נוספת',
}

const variantLabels: Record<NonNullable<Dish['variant']>, string> = {
  standard: 'רגילה',
  vegetarian: 'צמחונית',
  vegan: 'טבעונית',
  alternative: 'חלופית',
}

const weeks = groupCompetitionWeeks(contestants)
const weekByKey = new Map(weeks.map((week) => [`${week.season}:${week.week}`, week]))

export function generateStaticParams() {
  return weeks.map((week) => ({ season: String(week.season), week: String(week.week) }))
}

function getWeek(season: number, week: number) {
  return weekByKey.get(`${season}:${week}`)
}

function weekTitle(season: number, week: number, weekName?: string) {
  return `עונה ${season} · שבוע ${week}${weekName ? ` · ${weekName}` : ''}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { season: rawSeason, week: rawWeek } = await params
  const season = Number(rawSeason)
  const week = Number(rawWeek)
  const data = getWeek(season, week)
  if (!data) return {}

  const title = `${weekTitle(season, week, data.weekName)} — בואו לאכול איתי`
  const winnerText = data.winners.length
    ? `הזוכה${data.winners.length > 1 ? 'ים' : ''}: ${data.winners.map((entry) => entry.name).join(', ')}.`
    : 'ללא זוכה מתועד.'
  return {
    title,
    description: `${winnerText} ציונים, סדר אירוח, תפריטים ומקורות לכל משתתפי השבוע.`,
  }
}

function participantCount(entry: Contestant) {
  return entry.members?.length || 1
}

function uniqueSources(sources: SourceRef[]) {
  return [...new Map(sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
}

function dishVariant(dish: Dish) {
  return dish.variant ?? 'standard'
}

function isStandardPrimary(dish: Dish) {
  return dishVariant(dish) === 'standard' && ['starter', 'main', 'dessert'].includes(dish.course)
}

function primaryMenu(entry: Contestant) {
  return entry.dishes.filter(isStandardPrimary)
}

function extraMenu(entry: Contestant) {
  return entry.dishes.filter((dish) => !isStandardPrimary(dish))
}

function menuCompleteness(entry: Contestant) {
  const courses = new Set(primaryMenu(entry).map((dish) => dish.course))
  if (['starter', 'main', 'dessert'].every((course) => courses.has(course as Dish['course']))) return 'תפריט מלא'
  if (entry.dishes.length) return `${entry.dishes.length} מנות מתועדות`
  return 'אין עדיין מנות מתועדות'
}

function placementLabel(entry: Contestant) {
  if (entry.placement == null) return undefined
  const derived = (entry.fieldSources?.placement ?? []).some((source) => source.kind === 'derived')
  return `מקום ${entry.placement}${derived ? ' · נגזר מהציונים' : ''}`
}

function scoreText(entry: Contestant) {
  if (entry.score == null) return 'ציון לא מתועד'
  if (entry.status === 'disqualified') {
    return entry.scoreBeforeAdjustment != null
      ? `${entry.score} נק׳ לאחר פסילה · ${entry.scoreBeforeAdjustment} לפני התאמה`
      : `${entry.score} נק׳ · נפסל/ה`
  }
  return `${entry.score} נק׳`
}

function resultHeading(winners: Contestant[]) {
  if (!winners.length) return 'ללא זוכה מתועד'
  if (winners.length === 1) return `🏆 ${winners[0].name}`
  return `🏆 זכייה משותפת: ${winners.map((winner) => winner.name).join(', ')}`
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  )
}

function DishRow({ dish }: { dish: Dish }) {
  const variant = dishVariant(dish)
  const sources = uniqueSources(dish.sources ?? [])
  return (
    <li className={styles.dishRow}>
      <div className={styles.dishCopy}>
        <span>
          {courseLabels[dish.course]}
          {variant !== 'standard' ? ` · ${variantLabels[variant]}` : ''}
        </span>
        <strong>{dish.name}</strong>
        {dish.description ? <small>{dish.description}</small> : null}
      </div>
      {sources.length ? (
        <div className={styles.dishSources} aria-label={`מקורות למנה ${dish.name}`}>
          {sources.map((source) => <SourceBadge key={`${source.kind}:${source.url}`} source={source} />)}
        </div>
      ) : null}
    </li>
  )
}

export default async function WeekPage({ params }: PageProps) {
  const { season: rawSeason, week: rawWeek } = await params
  const season = Number(rawSeason)
  const weekNumber = Number(rawWeek)
  if (!Number.isInteger(season) || !Number.isInteger(weekNumber)) notFound()

  const data = getWeek(season, weekNumber)
  if (!data) notFound()

  const entries = [...data.entries].sort(
    (a, b) =>
      (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999) ||
      (a.placement ?? 999) - (b.placement ?? 999) ||
      a.name.localeCompare(b.name, 'he'),
  )
  const participants = entries.reduce((sum, entry) => sum + participantCount(entry), 0)
  const allSources = uniqueSources(entries.flatMap((entry) => entry.sources))
  const menuEntries = entries.filter((entry) => entry.dishes.length)
  const completeMenuEntries = entries.filter((entry) => menuCompleteness(entry) === 'תפריט מלא')
  const canShowScoreStats = data.scoreOrderEligible
  const scoreCoverage = `${data.scoreCount}/${data.activeCount}`
  const statusEntries = entries.filter((entry) => competitionStatusLabel(entry))

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <nav className={styles.breadcrumbs} aria-label="פירורי לחם">
          <Link href="/">המאגר</Link>
          <span>←</span>
          <Link href={`/seasons/${season}`}>עונה {season}</Link>
          <span>←</span>
          <strong>שבוע {weekNumber}</strong>
        </nav>

        <div className={styles.heroGrid}>
          <div>
            <div className="eyebrow">{weekTitle(season, weekNumber, data.weekName)}</div>
            <h1>השולחן<br/><em>של השבוע</em></h1>
            <p>
              {participants} משתתפים ב-{entries.length} יחידות תחרות. ציונים, סדר אירוח, תפריטים ומקורות —
              בלי להשלים נתונים חסרים מניחוש.
            </p>
          </div>
          <div className={styles.resultCard}>
            <span>תוצאת השבוע</span>
            <strong>{resultHeading(data.winners)}</strong>
            {data.hasDisqualification ? <small>שבוע חריג: קיימת פסילה, ולכן לא נגזר סדר תחרות מהציונים.</small> : null}
            {!data.hasDisqualification && data.scoreTie ? <small>בציונים הגולמיים יש לפחות תיקו אחד; הדירוג המוצג למטה נשען על הנתונים המתועדים.</small> : null}
          </div>
        </div>
      </header>

      <section className={styles.metrics} aria-label="סיכום השבוע">
        <Metric label="יחידות תחרות פעילות" value={data.activeCount} note={`${entries.length} רשומות כולל מצבים חריגים`} />
        <Metric label="כיסוי ציונים" value={scoreCoverage} note="רק רשומות תחרות פעילות" />
        <Metric label="ממוצע" value={canShowScoreStats ? data.meanScore ?? '—' : '—'} note={canShowScoreStats ? 'ציונים מלאים בשבוע רגיל' : 'לא מחושב בשבוע חסר/חריג'} />
        <Metric label="חציון" value={canShowScoreStats ? data.medianScore ?? '—' : '—'} />
        <Metric label="טווח ציונים" value={canShowScoreStats ? data.spread ?? '—' : '—'} note={canShowScoreStats ? `${data.minScore}–${data.maxScore}` : undefined} />
        <Metric label="תפריטים" value={`${completeMenuEntries.length}/${entries.length}`} note={`${menuEntries.length} עם לפחות מנה`} />
      </section>

      {statusEntries.length ? (
        <aside className={styles.exceptionNote}>
          <strong>מצבים חריגים בשבוע</strong>
          <p>{statusEntries.map((entry) => `${entry.name}: ${competitionStatusLabel(entry)}`).join(' · ')}</p>
        </aside>
      ) : null}

      <section className={styles.entriesSection} aria-labelledby="entries-title">
        <div className={styles.sectionHeading}>
          <div>
            <div className="eyebrow">לפי סדר האירוח</div>
            <h2 id="entries-title">מי אירח ומה הגיש?</h2>
          </div>
          <span>{entries.length} רשומות</span>
        </div>

        <div className={styles.entries}>
          {entries.map((entry) => {
            const status = competitionStatusLabel(entry)
            const standard = primaryMenu(entry)
            const extras = extraMenu(entry)
            const placement = placementLabel(entry)
            const entrySources = uniqueSources(entry.sources)
            return (
              <article className={`${styles.entry} ${entry.winner ? styles.winner : ''} ${status ? styles.exceptional : ''}`} key={entry.slug}>
                <div className={styles.orderColumn}>
                  <span>{entry.hostingOrder ? `אירוח #${entry.hostingOrder}` : 'סדר לא ידוע'}</span>
                  {entry.winner ? <b aria-label="זוכה">🏆</b> : null}
                </div>

                <div className={styles.entryBody}>
                  <div className={styles.entryHeader}>
                    <div>
                      <h3><Link href={`/contestants/${entry.slug}`}>{entry.name}</Link></h3>
                      <p>
                        {[entry.entryType === 'couple' ? 'זוג' : 'יחיד/ה', entry.city, entry.age ? `גיל ${entry.age}` : null, entry.occupation]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className={styles.scoreBlock}>
                      <strong>{scoreText(entry)}</strong>
                      {placement ? <span>{placement}</span> : null}
                      {status ? <span className={styles.statusBadge}>{status}</span> : null}
                    </div>
                  </div>

                  <div className={styles.menuHeader}>
                    <strong>{menuCompleteness(entry)}</strong>
                    <span>{entry.dishes.length ? `${entry.dishes.length} מנות/חלופות עם מקור` : 'נמשיך לחפש מקור לתפריט'}</span>
                  </div>

                  {standard.length ? (
                    <ol className={styles.menuList}>
                      {standard.map((dish) => <DishRow key={`${dish.course}:${dishVariant(dish)}:${dish.name}`} dish={dish} />)}
                    </ol>
                  ) : null}

                  {extras.length ? (
                    <details className={styles.extras}>
                      <summary>חלופות ומנות נוספות ({extras.length})</summary>
                      <ol className={styles.menuList}>
                        {extras.map((dish) => <DishRow key={`${dish.course}:${dishVariant(dish)}:${dish.name}`} dish={dish} />)}
                      </ol>
                    </details>
                  ) : null}

                  {!entry.dishes.length ? <p className={styles.emptyMenu}>אין עדיין מנה מתועדת ממקור מספיק מפורש.</p> : null}

                  <div className={styles.entryFooter}>
                    <Link href={`/contestants/${entry.slug}`}>לפרופיל המלא והמקורות ←</Link>
                    <div className={styles.sourceRow} aria-label={`מקורות עבור ${entry.name}`}>
                      {entrySources.slice(0, 6).map((source) => <SourceBadge key={`${source.kind}:${source.url}`} source={source} />)}
                      {entrySources.length > 6 ? <span>+{entrySources.length - 6} מקורות</span> : null}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className={styles.provenance} aria-labelledby="week-sources-title">
        <div>
          <div className="eyebrow">provenance</div>
          <h2 id="week-sources-title">מאיפה הגיע המידע?</h2>
          <p>{allSources.length} קישורי מקור ישירים משמשים את רשומות השבוע. מקורות למנות מוצגים גם ליד המנה עצמה.</p>
        </div>
        <div className={styles.allSources}>
          {allSources.map((source) => <SourceBadge key={`${source.kind}:${source.url}`} source={source} />)}
        </div>
      </section>

      <nav className={styles.weekNav} aria-label="ניווט שבוע ועונה">
        <Link href={`/seasons/${season}`}>← חזרה לעונה {season}</Link>
        <Link href={`/explore?season=${season}`}>לחקור את כל עונה {season} ←</Link>
      </nav>

      <SiteFooter />
    </main>
  )
}

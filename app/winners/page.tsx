import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { competitionEntries } from '@/lib/competition'
import { contestants } from '@/lib/data'

export const metadata: Metadata = {
  title: 'כל הזוכים',
  description: 'כל הזוכים והזוגות הזוכים בבואו לאכול איתי לפי עונה ושבוע, עם ציונים, תפריטים וקישורים לפרופילים ולמקורות.',
  alternates: { canonical: '/winners' },
  openGraph: {
    title: 'כל הזוכים — בואו לאכול איתי הדאטאבייס',
    description: 'כל הזוכים והזוגות הזוכים לפי עונה ושבוע, עם ציונים ותפריטים מתועדים.',
    url: '/winners',
  },
}

export default function WinnersPage() {
  const winners = competitionEntries(contestants)
    .filter((entry) => entry.winner)
    .sort((a, b) => b.season - a.season || (b.week ?? 0) - (a.week ?? 0) || a.name.localeCompare(b.name, 'he'))

  return (
    <main className="statsPage">
      <header className="analyticsHero">
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <Link className="creditsLink" href="/stats">לסטטיסטיקות →</Link>
        </div>
        <div className="analyticsHeroCopy">
          <div className="eyebrow">🏆 {winners.length} רשומות זוכות</div>
          <h1>כל<br/><em>הזוכים</em></h1>
          <p>הזוכים המתועדים במאגר, לפי עונה ושבוע. תיקו או זכייה משותפת נשארים כפי שהם במקור ולא נדחסים לזוכה יחיד.</p>
        </div>
      </header>

      <section className="analyticsSection" aria-labelledby="winners-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">לפי עונה ושבוע</div>
            <h2 id="winners-title">מי לקח את השבוע?</h2>
          </div>
          <Link className="analyticsNote" href="/explore?winner=yes">לפתוח ב־Explorer ←</Link>
        </div>
        <div className="rankingList">
          {winners.map((entry) => (
            <Link className="rankingRow" href={`/contestants/${entry.slug}`} key={entry.slug}>
              <span className="rankWinner">🏆</span>
              <div>
                <strong>{entry.name}</strong>
                <small>עונה {entry.season}{entry.week ? ` · שבוע ${entry.week}` : ''}{entry.weekName ? ` · ${entry.weekName}` : ''}</small>
              </div>
              <span>{entry.dishes.length ? `${entry.dishes.length} מנות` : 'תפריט חסר'}</span>
              <b>{entry.score ?? '—'}</b>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

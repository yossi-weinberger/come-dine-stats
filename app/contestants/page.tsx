import type { Metadata } from 'next'
import Link from 'next/link'
import { contestants, getStats } from '@/lib/data'
import { ContestantsIndex, type ContestantsIndexEntry } from '@/components/contestants-index'
import { SiteFooter } from '@/components/site-footer'
import styles from './contestants.module.css'

export const metadata: Metadata = {
  title: 'כל המשתתפים — בואו לאכול איתי הדאטאבייס',
  description: 'כל פרופילי המשתתפים בבואו לאכול איתי, מקובצים לפי עונה, עם חיפוש מהיר, עיר, גיל, ציון ומקצוע כשמתועדים.',
  alternates: { canonical: '/contestants' },
  openGraph: {
    title: 'כל המשתתפים — בואו לאכול איתי הדאטאבייס',
    description: 'אינדקס מהיר של כל פרופילי המשתתפים לפי עונה, עם קישור ישיר לכל פרופיל.',
    url: '/contestants',
  },
}

export default function ContestantsPage() {
  const stats = getStats()
  const entries: ContestantsIndexEntry[] = contestants.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    season: entry.season,
    week: entry.week,
    weekName: entry.weekName,
    hostingOrder: entry.hostingOrder,
    entryType: entry.entryType,
    members: entry.members,
    winner: entry.winner,
    age: entry.age,
    city: entry.city,
    occupation: entry.occupation,
    score: entry.score,
  }))

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <div className="heroLinks">
            <Link className="creditsLink" href="/explore">חיפוש מתקדם →</Link>
            <Link className="creditsLink" href="/stats">סטטיסטיקות →</Link>
          </div>
        </div>

        <div className={styles.heroCopy}>
          <div className="eyebrow">{contestants.length} פרופילים · {stats.participants} משתתפים</div>
          <h1>כל<br/><em>המשתתפים</em></h1>
          <p>האינדקס הפשוט של המאגר: מחפשים שם, עיר או מקצוע, בוחרים עונה ונכנסים ישר לפרופיל. זוגות נשמרים כפרופיל התחרות המשותף שלהם.</p>
        </div>
      </header>

      <ContestantsIndex entries={entries} />

      <SiteFooter />
    </main>
  )
}

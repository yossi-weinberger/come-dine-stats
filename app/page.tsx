import Link from 'next/link'
import { contestants, getStats } from '@/lib/data'
import { ContestantBrowser } from '@/components/contestant-browser'
import { SiteFooter } from '@/components/site-footer'

function Stat({ label, value, suffix }: { label: string; value: string | number | null; suffix?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value ?? '—'}{value != null && suffix ? <small>{suffix}</small> : null}</strong>
    </div>
  )
}

export default function Home() {
  const stats = getStats()

  return (
    <main>
      <section className="hero">
        <div className="heroTop">
          <div className="eyebrow">פרויקט לא-רשמי • v0.3 • source-first</div>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>
        <h1>בואו לאכול איתי<br/><em>הדאטאבייס</em></h1>
        <p>{stats.contestants} מתמודדים מאומתים כרגע, עם מנות, ציונים וסטטיסטיקות — ומקור לכל נתון.</p>
      </section>

      <section className="stats" aria-label="סטטיסטיקות המאגר">
        <Stat label="מתמודדים במאגר" value={stats.contestants} />
        <Stat label="עונות עם פרופילי מתמודדים" value={stats.seasons} />
        <Stat label="מנצחים" value={stats.winners} />
        <Stat label="מנות שנקלטו" value={stats.dishes} />
        <Stat label="גיל ממוצע" value={stats.averageAge} />
        <Stat label="ציון שיא" value={stats.topScore} />
      </section>

      <ContestantBrowser contestants={contestants} />

      <SiteFooter />
    </main>
  )
}

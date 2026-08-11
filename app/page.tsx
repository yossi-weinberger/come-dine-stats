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
  const seasons = [...new Set(contestants.map((contestant) => contestant.season))].sort((a, b) => a - b)

  return (
    <main>
      <section className="hero">
        <div className="heroTop">
          <div className="eyebrow">פרויקט לא-רשמי • v0.4 • source-first</div>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>
        <h1>בואו לאכול איתי<br/><em>הדאטאבייס</em></h1>
        <p>{stats.participants} משתתפים מאומתים כרגע, עם תוצאות, מנות וסטטיסטיקות — ומקור לכל נתון.</p>
      </section>

      <section className="stats" aria-label="סטטיסטיקות המאגר">
        <Stat label="משתתפים במאגר" value={stats.participants} />
        <Stat label="יחידות תחרות" value={stats.entries} />
        <Stat label="עונות עם נתוני משתתפים" value={stats.seasons} />
        <Stat label="זוכים / זוגות זוכים" value={stats.winners} />
        <Stat label="מנות שנקלטו" value={stats.dishes} />
        <Stat label="ציון שיא" value={stats.topScore} />
      </section>

      <section className="seasonStrip" aria-labelledby="season-strip-title">
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">לפי עונה</div>
            <h2 id="season-strip-title">להיכנס לתחרות עצמה</h2>
          </div>
          <span>שבועות · ציונים · זוכים · תפריטים</span>
        </div>
        <nav className="seasonPills homeSeasonPills" aria-label="דפי עונות">
          {seasons.map((season) => (
            <Link key={season} href={`/seasons/${season}`}>
              <span>עונה</span>
              <strong>{season}</strong>
            </Link>
          ))}
        </nav>
      </section>

      <ContestantBrowser contestants={contestants} />

      <SiteFooter />
    </main>
  )
}

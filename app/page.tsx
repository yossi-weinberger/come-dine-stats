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
          <div className="heroLinks">
            <Link className="creditsLink" href="/explore">חיפוש מתקדם →</Link>
            <Link className="creditsLink" href="/stats">סטטיסטיקות →</Link>
            <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
          </div>
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

      <section className="statsTeaser" aria-labelledby="stats-teaser-title">
        <div>
          <div className="eyebrow">לא רק לחפש שמות</div>
          <h2 id="stats-teaser-title">מה באמת קורה לאורך 10 עונות?</h2>
          <p>ציוני שיא, סדר אירוח, פערי ניצחון, גילאים, ערים, השוואת עונות וכיסוי התפריטים — עם כיסוי נתונים גלוי ליד כל ניתוח.</p>
        </div>
        <Link href="/stats">לכל הסטטיסטיקות ←</Link>
      </section>

      <section className="statsTeaser" aria-labelledby="explorer-teaser-title">
        <div>
          <div className="eyebrow">לחתוך את המאגר</div>
          <h2 id="explorer-teaser-title">מי זכה, איפה, באיזה גיל — ומה הוא הגיש?</h2>
          <p>חיפוש מתקדם לפי עונה, ציון, מקום, גיל, עיר ותפריט. אפשר גם לחפש ישירות שם של מנה ולשתף קישור עם כל המסננים.</p>
        </div>
        <Link href="/explore">ל־Explorer ←</Link>
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

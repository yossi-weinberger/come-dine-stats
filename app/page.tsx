import Link from 'next/link'
import { contestants, getStats } from '@/lib/data'
import { SourceBadge } from '@/components/source-badge'
import { SiteFooter } from '@/components/site-footer'

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return <div className="stat"><span>{label}</span><strong>{value ?? '—'}</strong></div>
}

export default function Home() {
  const stats = getStats()

  return (
    <main>
      <section className="hero">
        <div className="heroTop">
          <div className="eyebrow">פרויקט לא-רשמי • v0.2 • source-first</div>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>
        <h1>בואו לאכול איתי<br/><em>הדאטאבייס</em></h1>
        <p>כל המתמודדים, המנות, הציונים והסטטיסטיקות — עם מקור לכל נתון.</p>
      </section>

      <section className="stats">
        <Stat label="מתמודדים במאגר כרגע" value={stats.contestants} />
        <Stat label="עונות שיוצגו בדמו" value={stats.seasons} />
        <Stat label="מנות שנקלטו" value={stats.dishes} />
        <Stat label="מקורות ייחודיים" value={stats.sources} />
        <Stat label="גיל ממוצע" value={stats.averageAge} />
        <Stat label="ציון שיא בדמו" value={stats.topScore} />
      </section>

      <section className="section">
        <div className="sectionTitle"><h2>מתמודדים</h2><span>הדאטה כרגע הוא seed מאומת; ה-importers מרחיבים אותו בלי לאבד attribution.</span></div>
        <div className="cards">
          {contestants.map((c) => (
            <article className="card" key={c.slug}>
              <div className="cardTop"><span>עונה {c.season} · {c.weekName}</span>{c.winner && <b>🏆 מנצחת</b>}</div>
              <h3>{c.name}</h3>
              <div className="meta">{c.age && `${c.age} · `}{c.city}{c.score ? ` · ${c.score} נק׳` : ''}</div>
              <ol>
                {c.dishes.filter((d) => d.course !== 'alternative').map((d) => <li key={`${d.course}-${d.name}`}><strong>{d.name}</strong>{d.description && <small>{d.description}</small>}</li>)}
              </ol>
              <div className="sourceRow" aria-label={`מקורות עבור ${c.name}`}>
                <span>מקורות:</span>
                {[...new Map(c.sources.map((source) => [`${source.kind}:${source.url}`, source])).values()].map((source) => (
                  <SourceBadge key={`${source.kind}-${source.url}`} source={source} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

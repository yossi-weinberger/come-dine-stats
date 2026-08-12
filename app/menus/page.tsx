import type { Metadata } from 'next'
import Link from 'next/link'
import menuGapsJson from '@/data/reports/menu-gaps.json'
import { SiteFooter } from '@/components/site-footer'
import { contestants } from '@/lib/data'

export const metadata: Metadata = {
  title: 'התפריטים',
  description: 'התפריטים והמנות המתועדים של בואו לאכול איתי, כיסוי לפי עונה וקישורים למארחים ולמקורות הרשמיים.',
  alternates: { canonical: '/menus' },
  openGraph: {
    title: 'התפריטים — בואו לאכול איתי הדאטאבייס',
    description: 'מאות מנות מתועדות, תפריטים מלאים וכיסוי לפי עונה — בלי להשלים מנות חסרות מניחוש.',
    url: '/menus',
  },
}

type SeasonMenuCoverage = {
  entries: number
  anyDish: number
  complete: number
  oneCourseAway: number
  partial: number
  none: number
}

type MenuGapReport = {
  summary: {
    entries: number
    none: number
    partial: number
    oneCourseAway: number
    complete: number
  }
  bySeason: Record<string, SeasonMenuCoverage>
}

const report = menuGapsJson as unknown as MenuGapReport

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 10 : 0
}

export default function MenusPage() {
  const withMenus = contestants
    .filter((entry) => entry.dishes.length > 0)
    .sort((a, b) => b.season - a.season || (b.week ?? 0) - (a.week ?? 0) || a.name.localeCompare(b.name, 'he'))
  const seasons = Object.entries(report.bySeason).sort(([a], [b]) => Number(b) - Number(a))
  const totalDishes = contestants.reduce((sum, entry) => sum + entry.dishes.length, 0)

  return (
    <main className="statsPage">
      <header className="analyticsHero">
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <Link className="creditsLink" href="/explore?menu=complete">תפריטים מלאים ב־Explorer →</Link>
        </div>
        <div className="analyticsHeroCopy">
          <div className="eyebrow">{totalDishes} מנות · source-first menus</div>
          <h1>מה<br/><em>הגישו?</em></h1>
          <p>מנה נכנסת למאגר רק כשיש לה מקור. תפריט חסר נשאר חסר — ולא הופך לתפריט מלא בגלל ניחוש או סדר טקסט.</p>
        </div>
      </header>

      <section className="analysisStats" aria-label="כיסוי תפריטים">
        <div className="analysisStat"><span>רשומות עם לפחות מנה</span><strong>{withMenus.length}</strong><small>{percent(withMenus.length, report.summary.entries)}%</small></div>
        <div className="analysisStat"><span>תפריטים מלאים</span><strong>{report.summary.complete}</strong><small>{percent(report.summary.complete, report.summary.entries)}%</small></div>
        <div className="analysisStat"><span>חסרה מנה אחת</span><strong>{report.summary.oneCourseAway}</strong></div>
        <div className="analysisStat"><span>תפריט חלקי</span><strong>{report.summary.partial}</strong></div>
        <div className="analysisStat"><span>בלי מנה מתועדת</span><strong>{report.summary.none}</strong></div>
        <div className="analysisStat"><span>סך הכול מנות</span><strong>{totalDishes}</strong></div>
      </section>

      <section className="analyticsSection" aria-labelledby="menu-season-title">
        <div className="analyticsHeading">
          <div><div className="eyebrow">הכיסוי לא אחיד</div><h2 id="menu-season-title">תפריטים לפי עונה</h2></div>
          <Link className="analyticsNote" href="/stats#menu-coverage-title">לניתוח הכיסוי ←</Link>
        </div>
        <div className="seasonTableWrap">
          <table className="seasonCompareTable">
            <thead><tr><th>עונה</th><th>לפחות מנה</th><th>תפריט מלא</th><th>חלקי / חסרה מנה</th><th>ללא תפריט</th></tr></thead>
            <tbody>
              {seasons.map(([season, row]) => (
                <tr key={season}>
                  <th><Link href={`/seasons/${season}`}>עונה {season}</Link></th>
                  <td>{row.anyDish}/{row.entries} · {percent(row.anyDish, row.entries)}%</td>
                  <td><strong>{row.complete}/{row.entries} · {percent(row.complete, row.entries)}%</strong></td>
                  <td>{row.partial + row.oneCourseAway}</td>
                  <td>{row.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analyticsSection" aria-labelledby="menu-hosts-title">
        <div className="analyticsHeading">
          <div><div className="eyebrow">מארחים עם אוכל מתועד</div><h2 id="menu-hosts-title">להיכנס ישר לתפריט</h2></div>
          <span className="analyticsNote">{withMenus.length} רשומות</span>
        </div>
        <div className="rankingList">
          {withMenus.slice(0, 40).map((entry) => (
            <Link className="rankingRow" href={`/contestants/${entry.slug}#menu-title`} key={entry.slug}>
              <span>{entry.dishes.length}</span>
              <div><strong>{entry.name}</strong><small>עונה {entry.season}{entry.week ? ` · שבוע ${entry.week}` : ''}{entry.weekName ? ` · ${entry.weekName}` : ''}</small></div>
              {entry.winner && <span className="rankWinner">🏆</span>}
              <b>מנות</b>
            </Link>
          ))}
        </div>
        {withMenus.length > 40 && <p className="analysisIntro"><Link href="/explore?menu=any">לכל {withMenus.length} הרשומות עם מנות ב־Explorer ←</Link></p>}
      </section>

      <SiteFooter />
    </main>
  )
}

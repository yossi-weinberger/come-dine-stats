import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { contestants } from '@/lib/data'
import { scoreEntries } from '@/lib/competition'
import { buildWeekRecords, buildWinnerMargins } from '@/lib/stats-engine'

export const metadata: Metadata = {
  title: 'שיאים ורשומות',
  description: 'ציוני השיא, השבועות החזקים והצמודים ביותר ופערי הניצחון הבולטים בבואו לאכול איתי, עם הקשר וגודל מדגם.',
  alternates: { canonical: '/records' },
  openGraph: {
    title: 'שיאים ורשומות — בואו לאכול איתי הדאטאבייס',
    description: 'ציוני שיא, שבועות יוצאי דופן ופערי ניצחון — מתוך מנוע הסטטיסטיקות המתועד של המאגר.',
    url: '/records',
  },
}

function weekHref(record: { season: number; week: number }) {
  return `/seasons/${record.season}/weeks/${record.week}`
}

export default function RecordsPage() {
  const topScores = [...scoreEntries(contestants)]
    .sort((a, b) => (b.score as number) - (a.score as number) || a.name.localeCompare(b.name, 'he'))
    .slice(0, 15)
  const records = buildWeekRecords(contestants)
  const margins = buildWinnerMargins(contestants)
  const biggestMargin = [...margins].sort((a, b) => b.margin - a.margin)[0]
  const tightestMargin = [...margins].sort((a, b) => a.margin - b.margin)[0]

  const weekCards = [
    ['הממוצע השבועי הגבוה', records.highestMean, records.highestMean?.meanScore],
    ['הממוצע השבועי הנמוך', records.lowestMean, records.lowestMean?.meanScore],
    ['טווח הציונים הרחב', records.widestSpread, records.widestSpread?.spread],
    ['טווח הציונים הצמוד', records.tightestSpread, records.tightestSpread?.spread],
  ] as const

  return (
    <main className="statsPage">
      <header className="analyticsHero">
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <Link className="creditsLink" href="/stats">לכל הסטטיסטיקות →</Link>
        </div>
        <div className="analyticsHeroCopy">
          <div className="eyebrow">records · n גלוי</div>
          <h1>שיאים<br/><em>ורשומות</em></h1>
          <p>רשומות שנגזרות מה־Stats Engine. שבועות עם פסילה אינם נכנסים לניתוחים שתלויים בסדר ציונים רגיל.</p>
        </div>
      </header>

      <section className="analyticsSection" aria-labelledby="week-records-title">
        <div className="analyticsHeading">
          <div><div className="eyebrow">שבועות</div><h2 id="week-records-title">השבועות הבולטים</h2></div>
          <span className="analyticsNote">{records.eligibleWeeks} שבועות כשירים להשוואה</span>
        </div>
        <div className="analysisStats">
          {weekCards.map(([label, record, value]) => (
            <div className="analysisStat" key={label}>
              <span>{label}</span>
              <strong>{value ?? '—'}</strong>
              {record && <small><Link href={weekHref(record)}>עונה {record.season} · שבוע {record.week}{record.weekName ? ` · ${record.weekName}` : ''} · n={record.scoreCount}</Link></small>}
            </div>
          ))}
          <div className="analysisStat">
            <span>פער הניצחון הגדול</span>
            <strong>{biggestMargin ? `+${biggestMargin.margin}` : '—'}</strong>
            {biggestMargin && <small><Link href={weekHref(biggestMargin)}>{biggestMargin.winner.name} · עונה {biggestMargin.season} · שבוע {biggestMargin.week}</Link></small>}
          </div>
          <div className="analysisStat">
            <span>הניצחון הצמוד</span>
            <strong>{tightestMargin ? `+${tightestMargin.margin}` : '—'}</strong>
            {tightestMargin && <small><Link href={weekHref(tightestMargin)}>{tightestMargin.winner.name} · עונה {tightestMargin.season} · שבוע {tightestMargin.week}</Link></small>}
          </div>
        </div>
      </section>

      <section className="analyticsSection" aria-labelledby="score-records-title">
        <div className="analyticsHeading">
          <div><div className="eyebrow">ציונים</div><h2 id="score-records-title">הציונים הגבוהים במאגר</h2></div>
          <Link className="analyticsNote" href="/explore?sort=score-desc">ל־Explorer המלא ←</Link>
        </div>
        <div className="rankingList">
          {topScores.map((entry, index) => (
            <Link className="rankingRow" href={`/contestants/${entry.slug}`} key={entry.slug}>
              <span className="rankNumber">{index + 1}</span>
              <div><strong>{entry.name}</strong><small>עונה {entry.season}{entry.week ? ` · שבוע ${entry.week}` : ''}</small></div>
              {entry.winner && <span className="rankWinner">🏆</span>}
              <b>{entry.score}</b>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

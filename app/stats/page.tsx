import type { Metadata } from 'next'
import Link from 'next/link'
import coverageJson from '@/data/reports/coverage.json'
import { SiteFooter } from '@/components/site-footer'
import { contestants } from '@/lib/data'
import { competitionEntries, knownScores, scoreEntries } from '@/lib/competition'
import type { Contestant } from '@/lib/types'

export const metadata: Metadata = {
  title: 'סטטיסטיקות — בואו לאכול איתי הדאטאבייס',
  description: 'דירוגי ציונים, השוואת עונות, סדר אירוח, פערי ניצחון, גילאים, ערים וכיסוי תפריטים.',
}

type CoverageField = {
  count: number
  eligibleCount: number
  notApplicableCount: number
  percent: number
}

type CoverageReport = {
  overall: {
    entries: number
    participants: number
    individualEntries: number
    coupleEntries: number
    dishes: number
    winners: number
    fieldCoverage: Record<string, CoverageField>
    menuCoverage: {
      anyDish: { count: number; percent: number }
      threePrimaryCourses: { count: number; percent: number }
      vegetarianAlternative: { count: number; percent: number }
      veganAlternative: { count: number; percent: number }
      dishesByCourse: Record<string, number>
      dishesByVariant: Record<string, number>
    }
  }
}

type WeekResult = {
  season: number
  week: number
  weekName?: string
  winner: Contestant
  runnerUp: Contestant
  margin: number
}

const coverage = coverageJson as unknown as CoverageReport

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null
}

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 10 : 0
}

function barWidth(value: number, max: number) {
  if (!max) return 0
  return Math.max(3, Math.round((value / max) * 100))
}

function coverageLabel(field: CoverageField) {
  return `${field.count}/${field.eligibleCount} · ${field.percent}%`
}

function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="analysisStat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

function CoveragePill({ label, field }: { label: string; field: CoverageField }) {
  return (
    <span className="coveragePill" title={`${field.notApplicableCount} רשומות לא רלוונטיות לשדה`}>
      {label}: {coverageLabel(field)}
    </span>
  )
}

const scoreCoverage = coverage.overall.fieldCoverage.score
const ageCoverage = coverage.overall.fieldCoverage.age
const cityCoverage = coverage.overall.fieldCoverage.city
const hostingCoverage = coverage.overall.fieldCoverage.hostingOrder

export default function StatsPage() {
  const activeEntries = competitionEntries(contestants)
  const scored = scoreEntries(contestants)
  const scores = knownScores(contestants)
  const scoredWinners = activeEntries.filter((entry) => entry.winner && typeof entry.score === 'number')
  const winnerScores = scoredWinners.map((entry) => entry.score as number)
  const individualAges = contestants
    .filter((entry) => entry.entryType !== 'couple' && typeof entry.age === 'number')
    .map((entry) => entry.age as number)

  const topScores = [...scored]
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.name.localeCompare(b.name, 'he'))
    .slice(0, 10)

  const hostingRows = [1, 2, 3, 4, 5].map((order) => {
    const entries = activeEntries.filter((entry) => entry.hostingOrder === order)
    const withScore = scoreEntries(entries)
    const winners = entries.filter((entry) => entry.winner)
    return {
      order,
      entries: entries.length,
      scores: withScore.length,
      averageScore: average(withScore.map((entry) => entry.score as number)),
      winners: winners.length,
      winRate: percent(winners.length, entries.length),
    }
  })
  const maxHostingWinners = Math.max(...hostingRows.map((row) => row.winners), 1)

  const seasons = [...new Set(contestants.map((entry) => entry.season))].sort((a, b) => a - b)
  const seasonRows = seasons.map((season) => {
    const entries = contestants.filter((entry) => entry.season === season)
    const activeSeasonEntries = competitionEntries(entries)
    const seasonScores = knownScores(entries)
    const ages = entries
      .filter((entry) => entry.entryType !== 'couple' && typeof entry.age === 'number')
      .map((entry) => entry.age as number)
    return {
      season,
      entries: entries.length,
      activeEntries: activeSeasonEntries.length,
      participants: entries.reduce((sum, entry) => sum + (entry.members?.length || 1), 0),
      scoreCount: seasonScores.length,
      averageScore: average(seasonScores),
      topScore: seasonScores.length ? Math.max(...seasonScores) : null,
      winners: activeSeasonEntries.filter((entry) => entry.winner).length,
      averageAge: average(ages),
      dishes: entries.reduce((sum, entry) => sum + entry.dishes.length, 0),
    }
  })

  const weeks = new Map<string, Contestant[]>()
  for (const entry of contestants) {
    if (entry.week == null) continue
    const key = `${entry.season}:${entry.week}`
    weeks.set(key, [...(weeks.get(key) ?? []), entry])
  }

  const margins: WeekResult[] = []
  for (const weekEntries of weeks.values()) {
    const entries = competitionEntries(weekEntries)
    const winners = entries.filter((entry) => entry.winner && typeof entry.score === 'number')
    const others = entries
      .filter((entry) => !entry.winner && typeof entry.score === 'number')
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    if (winners.length !== 1 || !others.length) continue
    const winner = winners[0]
    const runnerUp = others[0]
    const margin = (winner.score as number) - (runnerUp.score as number)
    if (margin < 0) continue
    margins.push({
      season: winner.season,
      week: winner.week as number,
      weekName: winner.weekName,
      winner,
      runnerUp,
      margin,
    })
  }
  const biggestMargins = [...margins].sort((a, b) => b.margin - a.margin).slice(0, 6)
  const tightestMargins = [...margins].sort((a, b) => a.margin - b.margin).slice(0, 6)

  const ageBuckets = [
    { label: 'עד 29', min: -Infinity, max: 29 },
    { label: '30–39', min: 30, max: 39 },
    { label: '40–49', min: 40, max: 49 },
    { label: '50–59', min: 50, max: 59 },
    { label: '60+', min: 60, max: Infinity },
  ].map((bucket) => ({
    ...bucket,
    count: individualAges.filter((age) => age >= bucket.min && age <= bucket.max).length,
  }))
  const maxAgeBucket = Math.max(...ageBuckets.map((bucket) => bucket.count), 1)

  const cityCounts = new Map<string, number>()
  for (const entry of contestants) {
    if (!entry.city) continue
    cityCounts.set(entry.city, (cityCounts.get(entry.city) ?? 0) + 1)
  }
  const topCities = [...cityCounts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'he'))
    .slice(0, 10)
  const maxCity = Math.max(...topCities.map((row) => row.count), 1)

  const menuCoverage = coverage.overall.menuCoverage
  const exceptionalEntries = contestants.length - activeEntries.length

  return (
    <main className="statsPage">
      <header className="analyticsHero">
        <div className="heroTop">
          <Link className="backLink" href="/">← חזרה למאגר</Link>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>
        <div className="analyticsHeroCopy">
          <div className="eyebrow">10 עונות · source-first analytics</div>
          <h1>המספרים<br/><em>מאחורי השולחן</em></h1>
          <p>
            דירוגים והשוואות שנגזרים ישירות מהמאגר. בכל ניתוח מוצג הכיסוי שעליו הוא מבוסס,
            כדי להבדיל בין נתון מלא לבין תמונה חלקית.
          </p>
        </div>
        <div className="coverageRow" aria-label="כיסוי הנתונים המרכזיים">
          <CoveragePill label="ציונים" field={scoreCoverage} />
          <CoveragePill label="סדר אירוח" field={hostingCoverage} />
          <CoveragePill label="גיל (יחידים)" field={ageCoverage} />
          <CoveragePill label="עיר" field={cityCoverage} />
        </div>
      </header>

      <section className="analysisStats" aria-label="סיכום סטטיסטי">
        <StatCard label="ממוצע ציון תחרותי" value={average(scores) ?? '—'} note={`${scored.length} ציונים פעילים`} />
        <StatCard label="ממוצע ציון של זוכים" value={average(winnerScores) ?? '—'} note={`${scoredWinners.length} זוכים עם ציון`} />
        <StatCard label="גיל ממוצע מתועד" value={average(individualAges) ?? '—'} note="רשומות יחיד בלבד" />
        <StatCard label="ציון שיא" value={scores.length ? Math.max(...scores) : '—'} />
        <StatCard label="שבועות לניתוח פער" value={margins.length} note="זוכה יחיד + ציוני מתחרים פעילים" />
        <StatCard label="מנות מתועדות" value={coverage.overall.dishes} note={`${menuCoverage.anyDish.count} רשומות עם מנה`} />
      </section>

      <section className="analyticsSection" aria-labelledby="leaders-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">לוח התוצאות</div>
            <h2 id="leaders-title">הציונים הגבוהים במאגר</h2>
          </div>
          <CoveragePill label="כיסוי ציונים" field={scoreCoverage} />
        </div>
        <div className="rankingList">
          {topScores.map((entry, index) => (
            <Link className="rankingRow" href={`/contestants/${entry.slug}`} key={entry.slug}>
              <span className="rankNumber">{index + 1}</span>
              <div>
                <strong>{entry.name}</strong>
                <small>עונה {entry.season}{entry.week ? ` · שבוע ${entry.week}` : ''}{entry.weekName ? ` · ${entry.weekName}` : ''}</small>
              </div>
              {entry.winner && <span className="rankWinner">🏆</span>}
              <b>{entry.score}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="analyticsSection" aria-labelledby="hosting-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">יום האירוח</div>
            <h2 id="hosting-title">איפה נמצאים הזוכים?</h2>
          </div>
          <CoveragePill label="כיסוי סדר אירוח" field={hostingCoverage} />
        </div>
        <p className="analysisIntro">
          זהו תיאור של המאגר, לא טענה שסדר האירוח גורם לזכייה. פסולים, פורשים ואורחים אינם נכללים בחישובי התחרות.
        </p>
        <div className="hostingGrid">
          {hostingRows.map((row) => (
            <article className="hostingCard" key={row.order}>
              <div className="hostingCardTop">
                <span>אירוח #{row.order}</span>
                <strong>{row.winners} 🏆</strong>
              </div>
              <div className="miniBar" aria-hidden="true"><span style={{ width: `${barWidth(row.winners, maxHostingWinners)}%` }} /></div>
              <dl>
                <div><dt>ממוצע ציון</dt><dd>{row.averageScore ?? '—'}</dd></div>
                <div><dt>ציונים זמינים</dt><dd>{row.scores}/{row.entries}</dd></div>
                <div><dt>שיעור זוכים ברשומות</dt><dd>{row.winRate}%</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="analyticsSection" aria-labelledby="season-compare-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">עונה מול עונה</div>
            <h2 id="season-compare-title">איך העונות משתוות?</h2>
          </div>
          <span className="analyticsNote">ממוצעי ציון מחושבים רק מציונים של רשומות תחרות פעילות</span>
        </div>
        <div className="seasonTableWrap">
          <table className="seasonCompareTable">
            <thead>
              <tr>
                <th>עונה</th>
                <th>משתתפים</th>
                <th>ציונים</th>
                <th>ממוצע</th>
                <th>שיא</th>
                <th>גיל ממוצע</th>
                <th>מנות</th>
              </tr>
            </thead>
            <tbody>
              {seasonRows.map((row) => (
                <tr key={row.season}>
                  <th><Link href={`/seasons/${row.season}`}>עונה {row.season}</Link></th>
                  <td>{row.participants}</td>
                  <td>{row.scoreCount}/{row.activeEntries}</td>
                  <td><strong>{row.averageScore ?? '—'}</strong></td>
                  <td>{row.topScore ?? '—'}</td>
                  <td>{row.averageAge ?? '—'}</td>
                  <td>{row.dishes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analyticsSection" aria-labelledby="margin-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">הפרש מהמקום הבא</div>
            <h2 id="margin-title">ניצחונות מוחצים וצמודים</h2>
          </div>
          <span className="analyticsNote">{margins.length} שבועות עם נתונים תחרותיים מתאימים</span>
        </div>
        <div className="marginColumns">
          <div className="marginPanel">
            <h3>הפערים הגדולים</h3>
            {biggestMargins.map((result) => (
              <div className="marginRow" key={`big-${result.season}-${result.week}`}>
                <div>
                  <Link href={`/contestants/${result.winner.slug}`}>{result.winner.name}</Link>
                  <small>עונה {result.season} · שבוע {result.week}{result.weekName ? ` · ${result.weekName}` : ''}</small>
                </div>
                <span>{result.winner.score} מול {result.runnerUp.score}</span>
                <strong>+{result.margin}</strong>
              </div>
            ))}
          </div>
          <div className="marginPanel">
            <h3>הכי צמודים</h3>
            {tightestMargins.map((result) => (
              <div className="marginRow" key={`tight-${result.season}-${result.week}`}>
                <div>
                  <Link href={`/contestants/${result.winner.slug}`}>{result.winner.name}</Link>
                  <small>עונה {result.season} · שבוע {result.week}{result.weekName ? ` · ${result.weekName}` : ''}</small>
                </div>
                <span>{result.winner.score} מול {result.runnerUp.score}</span>
                <strong>+{result.margin}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="analyticsSplit">
        <section className="analyticsCard" aria-labelledby="age-title">
          <div className="analyticsHeading compact">
            <div>
              <div className="eyebrow">גיל</div>
              <h2 id="age-title">התפלגות גילאים</h2>
            </div>
          </div>
          <p className="coverageCaption">מבוסס על {coverageLabel(ageCoverage)} מרשומות היחיד.</p>
          <div className="barList">
            {ageBuckets.map((bucket) => (
              <div className="barRow" key={bucket.label}>
                <span>{bucket.label}</span>
                <div className="barTrack" aria-hidden="true"><i style={{ width: `${barWidth(bucket.count, maxAgeBucket)}%` }} /></div>
                <strong>{bucket.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="analyticsCard" aria-labelledby="cities-title">
          <div className="analyticsHeading compact">
            <div>
              <div className="eyebrow">גיאוגרפיה</div>
              <h2 id="cities-title">היישובים הבולטים</h2>
            </div>
          </div>
          <p className="coverageCaption">מבוסס על {coverageLabel(cityCoverage)} מרשומות התחרות.</p>
          <div className="barList cityBars">
            {topCities.map((row) => (
              <div className="barRow" key={row.city}>
                <span>{row.city}</span>
                <div className="barTrack" aria-hidden="true"><i style={{ width: `${barWidth(row.count, maxCity)}%` }} /></div>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="analyticsSection menuAnalytics" aria-labelledby="menu-coverage-title">
        <div className="analyticsHeading">
          <div>
            <div className="eyebrow">הצלחת</div>
            <h2 id="menu-coverage-title">כמה מהתפריטים באמת מתועדים?</h2>
          </div>
          <span className="analyticsNote">החוסר מוצג כחוסר — לא מושלם מניחוש</span>
        </div>
        <div className="menuCoverageGrid">
          <StatCard label="רשומות עם לפחות מנה" value={`${menuCoverage.anyDish.percent}%`} note={`${menuCoverage.anyDish.count}/${coverage.overall.entries}`} />
          <StatCard label="שלוש מנות עיקריות מתועדות" value={`${menuCoverage.threePrimaryCourses.percent}%`} note={`${menuCoverage.threePrimaryCourses.count}/${coverage.overall.entries}`} />
          <StatCard label="חלופה צמחונית" value={menuCoverage.vegetarianAlternative.count} note="רשומות" />
          <StatCard label="חלופה טבעונית" value={menuCoverage.veganAlternative.count} note="רשומות" />
        </div>
        <div className="courseCounts">
          <div><span>ראשונות</span><strong>{menuCoverage.dishesByCourse.starter ?? 0}</strong></div>
          <div><span>עיקריות</span><strong>{menuCoverage.dishesByCourse.main ?? 0}</strong></div>
          <div><span>קינוחים</span><strong>{menuCoverage.dishesByCourse.dessert ?? 0}</strong></div>
          <div><span>מנות נוספות</span><strong>{menuCoverage.dishesByCourse.other ?? 0}</strong></div>
        </div>
      </section>

      <aside className="statsMethodology">
        <div className="eyebrow">איך לקרוא את המספרים</div>
        <h2>הסטטיסטיקות טובות כמו הכיסוי שלהן</h2>
        <p>
          כל החישובים נעשים מהנתונים המנורמלים באתר. נתון חסר לא הופך לאפס ולא מושלם בהשערה;
          זוגות מוחרגים ממדדים אישיים כמו גיל; ופער ניצחון מחושב רק בשבוע שבו יש זוכה יחיד עם ציון
          ולפחות מתחרה פעיל נוסף עם ציון. {exceptionalEntries} רשומות חריגות (פסילה, פרישה או אורח) נשארות במאגר
          ובדפי ההקשר שלהן, אך אינן מעוותות ממוצעי תחרות רגילים.
        </p>
      </aside>

      <SiteFooter />
    </main>
  )
}

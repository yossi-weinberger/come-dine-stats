import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/site-footer'
import { SourceBadge } from '@/components/source-badge'
import { contestants } from '@/lib/data'
import { contestantFromRouteSlug, displayWeekName } from '@/lib/presentation'
import type { Contestant, Dish, SourceRef } from '@/lib/types'

type PageProps = { params: Promise<{ slug: string }> }

type ProfileField =
  | 'week'
  | 'weekName'
  | 'hostingOrder'
  | 'age'
  | 'city'
  | 'region'
  | 'occupation'
  | 'relationshipStatus'
  | 'gender'
  | 'diet'
  | 'score'
  | 'placement'
  | 'winner'

const fieldLabels: Record<ProfileField, string> = {
  week: 'שבוע',
  weekName: 'שם השבוע / אזור',
  hostingOrder: 'סדר אירוח',
  age: 'גיל',
  city: 'עיר / יישוב',
  region: 'אזור',
  occupation: 'מקצוע',
  relationshipStatus: 'מצב משפחתי',
  gender: 'מגדר',
  diet: 'תזונה',
  score: 'ציון',
  placement: 'מיקום',
  winner: 'זכייה',
}

const courseLabels: Record<string, string> = {
  starter: 'מנה ראשונה',
  main: 'מנה עיקרית',
  dessert: 'קינוח',
  other: 'מנה נוספת מתועדת',
}

const variantLabels: Record<string, string> = {
  standard: 'רגילה',
  vegetarian: 'צמחונית',
  vegan: 'טבעונית',
  alternative: 'חלופית',
}

function uniqueSources(sources: SourceRef[]) {
  return [...new Map(sources.map((source) => [`${source.kind}:${source.url}`, source])).values()]
}

function displayValue(entry: Contestant, field: ProfileField) {
  const value = entry[field]
  if (value == null || value === '') return null

  if (field === 'winner') return value ? 'מקום ראשון' : null
  if (field === 'week') return `שבוע ${value}`
  if (field === 'weekName') return displayWeekName(String(value))
  if (field === 'hostingOrder') return `יום ${value}`
  if (field === 'age') return `גיל ${value}`
  if (field === 'score') return `${value} נק׳`
  if (field === 'placement') return `מקום ${value}`
  return String(value)
}

function variantOf(dish: Dish) {
  return dish.variant ?? 'standard'
}

function dishKey(dish: Dish) {
  return `${dish.course}:${variantOf(dish)}:${dish.name}`
}

function participantLabel(entry: Contestant) {
  return entry.entryType === 'couple' ? 'זוג בתחרות' : 'מתמודד/ת יחיד/ה'
}

function relationToCurrent(current: Contestant, candidate: Contestant) {
  return candidate.season === current.season && candidate.week === current.week
}

export function generateStaticParams() {
  return contestants.map((entry) => ({ slug: entry.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const entry = contestantFromRouteSlug(contestants, slug)
  if (!entry) return {}

  return {
    title: `${entry.name} — בואו לאכול איתי הדאטאבייס`,
    description: `${entry.name}, עונה ${entry.season}: ציון, מנות, פרטי תחרות ומקורות.`,
  }
}

export default async function ContestantPage({ params }: PageProps) {
  const { slug } = await params
  const entry = contestantFromRouteSlug(contestants, slug)
  if (!entry) notFound()

  const sameWeek = contestants
    .filter((candidate) => relationToCurrent(entry, candidate))
    .sort((a, b) => (a.hostingOrder ?? 999) - (b.hostingOrder ?? 999))
  const currentIndex = sameWeek.findIndex((candidate) => candidate.slug === entry.slug)
  const previous = currentIndex > 0 ? sameWeek[currentIndex - 1] : undefined
  const next = currentIndex >= 0 && currentIndex < sameWeek.length - 1 ? sameWeek[currentIndex + 1] : undefined

  const fields = (Object.keys(fieldLabels) as ProfileField[])
    .map((field) => ({
      field,
      label: fieldLabels[field],
      value: displayValue(entry, field),
      sources: uniqueSources(entry.fieldSources?.[field] ?? []),
    }))
    .filter((item) => item.value != null)

  const dishes = entry.dishes
  const standardDishes = dishes.filter((dish) => variantOf(dish) === 'standard')
  const alternativeDishes = dishes.filter((dish) => variantOf(dish) !== 'standard')
  const sources = uniqueSources([
    ...entry.sources,
    ...Object.values(entry.fieldSources ?? {}).flat(),
    ...dishes.flatMap((dish) => dish.sources ?? []),
  ])

  return (
    <main className="contestantPage">
      <header className="contestantHero">
        <div className="heroTop">
          <Link className="backLink" href={`/seasons/${entry.season}`}>← חזרה לעונה {entry.season}</Link>
          <Link className="creditsLink" href="/sources">מקורות וקרדיטים →</Link>
        </div>

        <div className="contestantHeroGrid">
          <div>
            <div className="eyebrow">
              עונה {entry.season}
              {entry.week ? ` · שבוע ${entry.week}` : ''}
              {entry.weekName ? ` · ${displayWeekName(entry.weekName)}` : ''}
            </div>
            <h1>{entry.name}</h1>
            <p>{participantLabel(entry)}{entry.status === 'withdrawn' ? ' · פרש/ה מהתחרות' : ''}</p>
          </div>

          <div className={`contestantResult ${entry.winner ? 'winner' : ''}`}>
            <span>{entry.winner ? '🏆 תוצאה' : 'תוצאה'}</span>
            <strong>{entry.score != null ? entry.score : '—'}</strong>
            <small>{entry.score != null ? 'נקודות' : 'ציון לא מתועד'}</small>
            {entry.placement && <b>מקום {entry.placement}</b>}
          </div>
        </div>
      </header>

      {entry.members && entry.members.length > 1 && (
        <section className="memberPanel" aria-label="חברי הזוג">
          <span>חברי הזוג</span>
          <div>{entry.members.map((member) => <strong key={member}>{member}</strong>)}</div>
        </section>
      )}

      <section className="profileSection" aria-labelledby="profile-title">
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">הפרופיל</div>
            <h2 id="profile-title">מה ידוע במאגר</h2>
          </div>
          <span>כל שדה מציג את המקור שלו כשיש evidence ברמת השדה</span>
        </div>

        <div className="profileGrid">
          {fields.map((item) => (
            <article className="profileFact" key={item.field}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {item.sources.length > 0 && (
                <div className="factSources">
                  {item.sources.slice(0, 3).map((source) => (
                    <SourceBadge key={`${source.kind}:${source.url}`} source={source} />
                  ))}
                  {item.sources.length > 3 && <small>+{item.sources.length - 3}</small>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="menuSection" aria-labelledby="menu-title">
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">מה הוגש</div>
            <h2 id="menu-title">התפריט המתועד</h2>
          </div>
          <span>{dishes.length} מנות / חלופות במאגר</span>
        </div>

        {standardDishes.length > 0 ? (
          <div className="menuGrid">
            {standardDishes.map((dish) => (
              <article className="menuDish" key={dishKey(dish)}>
                <div className="dishHeading">
                  <span>{courseLabels[dish.course] ?? dish.course}</span>
                  {dish.label && <small>{dish.label}</small>}
                </div>
                <h3>{dish.name}</h3>
                {dish.description && <p>{dish.description}</p>}
                {dish.tags && dish.tags.length > 0 && (
                  <div className="dishTags">{dish.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                )}
                {dish.sources && dish.sources.length > 0 && (
                  <div className="sourceRow">
                    <span>מקור למנה:</span>
                    {uniqueSources(dish.sources).map((source) => (
                      <SourceBadge key={`${source.kind}:${source.url}`} source={source} />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyProfileState">אין עדיין תפריט רגיל מתועד לרשומה הזו.</div>
        )}

        {alternativeDishes.length > 0 && (
          <div className="alternativeBlock">
            <h3>חלופות ומנות נוספות</h3>
            <div className="alternativeDishGrid">
              {alternativeDishes.map((dish) => (
                <div key={dishKey(dish)}>
                  <span>{courseLabels[dish.course] ?? dish.course} · {variantLabels[variantOf(dish)] ?? variantOf(dish)}</span>
                  <strong>{dish.name}</strong>
                  {dish.description && <small>{dish.description}</small>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {entry.episodeUrls && entry.episodeUrls.length > 0 && (
        <section className="episodeSection" aria-labelledby="episodes-title">
          <div>
            <div className="eyebrow">פרקים</div>
            <h2 id="episodes-title">קישורי הפרק המתועדים</h2>
          </div>
          <div className="episodeLinks">
            {entry.episodeUrls.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">פרק {index + 1} ↗</a>
            ))}
          </div>
        </section>
      )}

      <section className="evidenceSection" aria-labelledby="evidence-title">
        <div>
          <div className="eyebrow">source-first</div>
          <h2 id="evidence-title">כל מקורות הרשומה</h2>
          <p>
            אלה המקורות שתרמו לפרופיל, לתוצאות או למנות. כשמקורות חולקים או סותרים שדה,
            ה-pipeline שומר את העדויות במקום למחוק אותן.
          </p>
        </div>
        <div className="evidenceBadges">
          {sources.map((source) => (
            <SourceBadge key={`${source.kind}:${source.url}`} source={source} />
          ))}
        </div>
      </section>

      <nav className="contestantPager" aria-label="מתמודד קודם והבא בשבוע">
        {previous ? (
          <Link href={`/contestants/${previous.slug}`}>← {previous.name}</Link>
        ) : <span />}
        <Link className="weekBack" href={`/seasons/${entry.season}${entry.week ? `#week-${entry.week}` : ''}`}>
          כל השבוע
        </Link>
        {next ? (
          <Link href={`/contestants/${next.slug}`}>{next.name} →</Link>
        ) : <span />}
      </nav>

      <SiteFooter />
    </main>
  )
}

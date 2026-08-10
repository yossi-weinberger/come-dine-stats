import Link from 'next/link'
import { sourceRegistry } from '@/lib/sources'

export const metadata = {
  title: 'מקורות וקרדיטים — בואו לאכול איתי הדאטאבייס',
}

export default function SourcesPage() {
  return (
    <main>
      <header className="sourcesHero">
        <Link className="backLink" href="/">← חזרה לדאטאבייס</Link>
        <div className="eyebrow">שקיפות לפני הכול</div>
        <h1 className="sourcesTitle">מקורות<br/><em>וקרדיטים</em></h1>
        <p>אנחנו לא מוחקים את הדרך שבה הנתון הגיע אלינו. לכל רשומה נשמר מקור, ובמקרה של סתירה נשמרות שתי העדויות.</p>
      </header>

      <section className="sourceGrid" aria-label="מקורות הפרויקט">
        {sourceRegistry.filter((source) => source.id !== 'manual').map((source) => (
          <article className="sourceCard" key={source.id}>
            <div className="sourceKind">{source.id}</div>
            <h2>{source.name}</h2>
            <p className="sourceRole">{source.role}</p>
            <dl>
              <div><dt>קרדיט</dt><dd>{source.attribution}</dd></div>
              {source.license && <div><dt>רישיון</dt><dd>{source.license}</dd></div>}
              <div><dt>איך אנחנו משתמשים בו</dt><dd>{source.reusePolicy}</dd></div>
            </dl>
            <div className="sourceLinks">
              <a href={source.url} target="_blank" rel="noreferrer">למקור ↗</a>
              {source.licenseUrl && <a href={source.licenseUrl} target="_blank" rel="noreferrer">לרישיון ↗</a>}
            </div>
          </article>
        ))}
      </section>

      <section className="attributionPolicy">
        <h2>מדיניות ייחוס</h2>
        <p>בעמוד של כל מתמודד יוצגו המקורות ששימשו לבניית הרשומה. אם שדה הגיע ממספר מקורות, כולם יישמרו ב־field evidence. מידע ששוחזר מ־Wayback יכלול גם את הכתובת המקורית וגם את כתובת ה־snapshot.</p>
        <p>בפרט, טקסט שמקורו ב־Fandom יקושר לעמוד המקורי. מדיה מ־Fandom או מכאן אינה נשאבת אוטומטית, כי רישיון טקסט אינו בהכרח רישיון למדיה.</p>
      </section>
    </main>
  )
}

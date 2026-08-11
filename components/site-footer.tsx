import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div>
        <strong>בואו לאכול איתי — הדאטאבייס</strong>
        <p>פרויקט מעריצים לא-רשמי. כל נתון נשמר עם המקור שממנו נלקח.</p>
      </div>
      <nav aria-label="קישורי אתר ומקור">
        <Link href="/stats">סטטיסטיקות המאגר</Link>
        <Link href="/sources">מקורות, קרדיטים ורישיונות</Link>
        <a href="https://github.com/nemo369/dine-with-me" target="_blank" rel="noreferrer">קרדיט לפרויקט הסטטיסטיקות המקורי ↗</a>
      </nav>
    </footer>
  )
}

import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'

export default function NotFound() {
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">404 · העמוד לא נמצא</div>
        <h1>הצלחת ריקה<br/><em>אבל המאגר לא</em></h1>
        <p>הקישור הזה לא מוביל כרגע לעמוד קיים. אפשר לחזור למאגר, לחפש משתתף או לעבור לסטטיסטיקות.</p>
        <div className="heroLinks">
          <Link className="creditsLink" href="/">למאגר הראשי ←</Link>
          <Link className="creditsLink" href="/explore">חיפוש מתקדם ←</Link>
          <Link className="creditsLink" href="/stats">סטטיסטיקות ←</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}

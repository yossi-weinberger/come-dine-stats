import { ImageResponse } from 'next/og'
import { contestants, getStats } from '@/lib/data'

export const alt = 'בואו לאכול איתי — הדאטאבייס: עונות, מתמודדים, ציונים, זוכים ותפריטים'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  const stats = getStats()
  const menuEntries = contestants.filter((entry) => entry.dishes.length > 0).length

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          direction: 'rtl',
          background: '#f7f1e8',
          color: '#171411',
          padding: '64px 72px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
          <span>פרויקט לא־רשמי · source-first</span>
          <span>{stats.seasons} עונות</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: '-3px' }}>בואו לאכול איתי</div>
          <div style={{ fontSize: 58, fontStyle: 'italic' }}>הדאטאבייס</div>
          <div style={{ fontSize: 28, maxWidth: 940, lineHeight: 1.4 }}>
            מתמודדים, שבועות, ציונים, זוכים ותפריטים — עם מקור לכל נתון.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 36, fontSize: 25 }}>
          <span><b>{stats.participants}</b> משתתפים</span>
          <span><b>{stats.winners}</b> זוכים</span>
          <span><b>{stats.dishes}</b> מנות</span>
          <span><b>{menuEntries}</b> רשומות עם תפריט</span>
        </div>
      </div>
    ),
    size,
  )
}

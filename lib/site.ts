export const SITE_NAME = 'בואו לאכול איתי — הדאטאבייס'
export const SITE_DESCRIPTION = 'מאגר וסטטיסטיקות לא-רשמי, source-first, של בואו לאכול איתי: עונות, שבועות, מתמודדים, ציונים, זוכים ותפריטים עם מקורות.'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://come-dine-stats.vercel.app'

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString()
}

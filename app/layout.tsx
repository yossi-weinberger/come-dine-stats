import './globals.css'

export const metadata = {
  title: 'בואו לאכול איתי — הדאטאבייס',
  description: 'מאגר וסטטיסטיקות לא-רשמי של בואו לאכול איתי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}

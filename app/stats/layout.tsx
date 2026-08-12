import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/stats' },
  openGraph: { url: '/stats' },
}

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children
}

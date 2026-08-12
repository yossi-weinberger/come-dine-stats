import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ season: string; week: string }> }): Promise<Metadata> {
  const { season, week } = await params
  const path = `/seasons/${season}/weeks/${week}`
  return {
    alternates: { canonical: path },
    openGraph: { url: path },
  }
}

export default function WeekLayout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }): Promise<Metadata> {
  const { season } = await params
  const path = `/seasons/${season}`
  return {
    alternates: { canonical: path },
    openGraph: { url: path },
  }
}

export default function SeasonLayout({ children }: { children: React.ReactNode }) {
  return children
}

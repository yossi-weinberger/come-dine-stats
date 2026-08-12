import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const path = `/contestants/${slug}`
  return {
    alternates: { canonical: path },
    openGraph: { url: path },
  }
}

export default function ContestantLayout({ children }: { children: React.ReactNode }) {
  return children
}

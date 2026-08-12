import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/sources' },
  openGraph: { url: '/sources' },
}

export default function SourcesLayout({ children }: { children: React.ReactNode }) {
  return children
}

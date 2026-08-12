import type { MetadataRoute } from 'next'
import { contestants } from '@/lib/data'
import { absoluteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    ['/', 1],
    ['/explore', 0.8],
    ['/stats', 0.9],
    ['/winners', 0.9],
    ['/records', 0.9],
    ['/menus', 0.9],
    ['/sources', 0.6],
  ] as const

  const seasons = [...new Set(contestants.map((entry) => entry.season))].sort((a, b) => a - b)
  const weeks = [...new Set(
    contestants
      .filter((entry) => entry.week != null)
      .map((entry) => `${entry.season}:${entry.week}`),
  )]

  return [
    ...staticRoutes.map(([path, priority]) => ({
      url: absoluteUrl(path),
      changeFrequency: path === '/' ? 'daily' as const : 'weekly' as const,
      priority,
    })),
    ...seasons.map((season) => ({
      url: absoluteUrl(`/seasons/${season}`),
      changeFrequency: season === Math.max(...seasons) ? 'daily' as const : 'monthly' as const,
      priority: 0.85,
    })),
    ...weeks.map((key) => {
      const [season, week] = key.split(':')
      return {
        url: absoluteUrl(`/seasons/${season}/weeks/${week}`),
        changeFrequency: Number(season) === Math.max(...seasons) ? 'daily' as const : 'monthly' as const,
        priority: 0.75,
      }
    }),
    ...contestants.map((entry) => ({
      url: absoluteUrl(`/contestants/${entry.slug}`),
      changeFrequency: entry.season === Math.max(...seasons) ? 'weekly' as const : 'yearly' as const,
      priority: entry.winner ? 0.8 : 0.65,
    })),
  ]
}

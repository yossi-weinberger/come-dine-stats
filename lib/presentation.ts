import type { Contestant, Dish } from './types'

export function decodeRouteSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function contestantFromRouteSlug(contestants: Contestant[], routeSlug: string) {
  const decoded = decodeRouteSegment(routeSlug)
  return contestants.find((entry) => entry.slug === routeSlug || entry.slug === decoded)
}

export function displayWeekName(weekName?: string) {
  if (!weekName) return undefined
  if (weekName === 'שמנים') return '״שמנים״ — כינוי ב־Fandom'
  return weekName
}

export function dishVariant(dish: Dish) {
  return dish.variant ?? 'standard'
}

export function variantLabel(variant: string) {
  if (variant === 'vegan') return 'חלופה טבעונית'
  if (variant === 'vegetarian') return 'חלופה צמחונית'
  return undefined
}
